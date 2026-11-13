import asyncio
import json
import logging
import os
import wave
from datetime import UTC, datetime
from typing import Any

from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    ChatContext,
    ChatMessage,
    CloseEvent,
    EndpointingOptions,
    FunctionCall,
    FunctionCallOutput,
    MetricsCollectedEvent,
    RunContext,
    TurnHandlingOptions,
    function_tool,
    llm,
    room_io,
)
from livekit.agents.llm import ImageContent
from livekit.agents.metrics import EOUMetrics, LLMMetrics, STTMetrics, TTSMetrics
from livekit.agents.stt import SpeechEventType
from livekit.plugins import openai, silero, xai

import session_store
from amenities import describe_ranking, rank_properties, shortlist_payload
from properties import (
    PROPERTIES,
    format_property_details,
    get_property_by_id,
    get_property_images,
)
from web_search import perplexity_search

todays_date = datetime.now().strftime("%Y-%m-%d")

load_dotenv(".env")
load_dotenv(".env.local", override=True)

logger = logging.getLogger("latency")

vad = silero.VAD.load(min_silence_duration=0.3)


def _parse_metadata(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}

def format_transcript(history: llm.ChatContext) -> str:
    lines: list[str] = []
    for item in history.items:
        if isinstance(item, ChatMessage):
            text = (item.text_content or "").strip()
            if not text:
                continue
            lines.append(f"{item.role.upper()}: {text}")
        elif isinstance(item, FunctionCall):
            lines.append(f"TOOL CALL: {item.name}({item.arguments})")
        elif isinstance(item, FunctionCallOutput):
            lines.append(f"TOOL RESULT ({item.name}): {item.output}")
    return "\n\n".join(lines) if lines else "(No transcript captured.)"


def build_instructions(prop: dict[str, Any] | None) -> str:
    # Resolve next to this file and read as UTF-8: the prompt has non-ASCII text, and
    # Windows' default code page would garble it or fail when run from another folder.
    prompt_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompts", "v2.md")
    with open(prompt_path, encoding="utf-8") as f:
        base = f.read() + "# Context - Today's Date is: " + todays_date

    if prop:
        base += "=== PROPERTY DETAILS ===\n" + format_property_details(prop)
    else:
        base += (
            "\n\n=== GENERAL SEARCH MODE ===\n"
            "Sam has not picked a property yet. Help them find one across all "
            "our listings. When they care about what is nearby (supermarkets, "
            "parks, stations, schools, gyms, pharmacies, cafes, pubs, doctors), "
            "call find_properties_near with that amenity and any budget or "
            "bedroom limit they mention. Read back the top two or three "
            "results with the walking time, then ask which one they'd like to "
            "hear more about. Distances are straight-line estimates; say "
            "'roughly' or 'about'. Their screen shows a map and an info panel: "
            "when you talk about a specific listing, call show_property so it "
            "opens for them. You can book a viewing (book_viewing) or reserve "
            "the unit (reserve_unit) for whichever listing they choose.\n"
        )

    return base


class PropertyAgent(Agent):
    def __init__(
        self,
        prop: dict[str, Any] | None,
        chat_ctx: ChatContext | None = None,
    ) -> None:
        self._call_details_saved = False
        self._property = prop
        self._turn_snippet_index = 0
        super().__init__(
            instructions=build_instructions(prop),
            chat_ctx=chat_ctx,
        )

    @function_tool()
    async def web_search(
        self,
        context: RunContext,
        query: str,
        pincode: str | None = None,

    ) -> str:
        """Search the web for up-to-date local-area information.

        Use this for questions about the property's surroundings that aren't in
        the provided property details, e.g. nearby transport links, schools,
        shops, restaurants, or amenities.

        Args:
            query: What to search for, phrased as a natural-language question
                (e.g. "nearest train stations and schools").
            pincode: The UK postcode of the property (or nearby area) to focus
                the search on a specific location. Pass it whenever you know the
                property's postcode so results are geographically relevant.
        """
        if not pincode and self._property:
            address = self._property.get("address") or {}
            pincode = str(address.get("postcode", "") or "")

        # Fire-and-forget filler so the caller hears something while the
        # ~1.3s web search runs (do NOT await, so it plays concurrently).
        #context.session.say("Let me look that up for you.")

        if not os.getenv("PERPLEXITY_API_KEY"):
            return (
                "Web search is not available right now. For nearby supermarkets, "
                "parks, stations, schools or gyms use find_properties_near; "
                "otherwise say you'll check with the lettings team."
            )
        try:
            return await perplexity_search(query=query, pincode=pincode)
        except Exception as error:
            logger.warning("web_search failed: %s", error)
            return "Web search failed just now; say you'll check and follow up."

    @function_tool()
    async def find_properties_near(
        self,
        context: RunContext,
        amenity: str,
        max_price: float | None = None,
        min_bedrooms: int | None = None,
        limit: int = 5,
    ) -> str:
        """Rank our listings by how close they are to an amenity, using map data.

        Use this when the caller wants to be near something, e.g. "which flats
        are closest to a supermarket?", "something near a park under 2,500 a
        month", "close to the DLR with two bedrooms".

        Args:
            amenity: What they want nearby, e.g. supermarket, park, station,
                school, gym, pharmacy, cafe, restaurant, pub, hospital.
            max_price: Optional maximum monthly rent (or price) in pounds.
            min_bedrooms: Optional minimum number of bedrooms.
            limit: How many listings to return (default 5).
        """
        rows = await asyncio.to_thread(
            rank_properties,
            amenity,
            max_price=max_price,
            min_bedrooms=min_bedrooms,
            limit=max(1, min(limit, 10)),
        )
        if rows:
            # Pin results on the caller's map and open the top one.
            session_store.save_search(
                shortlist=shortlist_payload(rows),
                focus_id=str(rows[0]["prop"].get("property_id")),
            )
        return describe_ranking(amenity, rows)

    @function_tool()
    async def show_property(self, context: RunContext, property_id: str) -> str:
        """Open a listing on the caller's screen and get its full details.

        Call this whenever you start talking about a specific listing (for
        example after Sam picks one from find_properties_near), so it appears
        in their info panel and on the map.

        Args:
            property_id: The listing id, e.g. 21800300 or kelso-villa.
        """
        prop = get_property_by_id(property_id)
        if not prop:
            return f"No listing found with id {property_id}."
        session_store.save_search(focus_id=str(prop.get("property_id")))
        return format_property_details(prop)

    @function_tool()
    async def reserve_unit(
        self,
        context: RunContext,
        customer_name: str,
        phone: str = "",
        email: str = "",
        move_in_date: str = "",
        property_id: str | None = None,
    ) -> str:
        """Place a holding reservation on a unit for the caller.

        Use when Sam says they want to take, rent, reserve or secure the unit
        (not just view it). Confirm their name and at least one contact detail
        first. This records a reservation request; the lettings team confirms
        it and takes any holding deposit, so never ask for payment details.

        Args:
            customer_name: The caller's full name.
            phone: Contact phone number.
            email: Contact email.
            move_in_date: Preferred move-in date (e.g. '2026-12-01').
            property_id: The listing to reserve; defaults to the one being discussed.
        """
        pid = property_id or (
            str(self._property.get("property_id")) if self._property else None
        )
        if not pid or not get_property_by_id(pid):
            return "Which property would you like to reserve? I need the listing first."
        session_store.save_booking_details({
            "type": "reservation",
            "property_id": pid,
            "date": move_in_date or todays_date,
            "time": "",
            "customer_name": customer_name,
            "status": "confirmed",
        })
        session_store.save_customer_details(
            {"name": customer_name, "phone": phone, "email": email}
        )
        logger.info("Reservation requested for %s by %s", pid, customer_name)
        return (
            f"Reservation request recorded for {customer_name} on listing {pid}"
            + (f", moving in {move_in_date}" if move_in_date else "")
            + ". Tell them the lettings team will call to confirm and explain the holding deposit."
        )

    async def stt_node(self, audio, model_settings):
        """Capture the user's audio per turn and save a WAV snippet the moment
        the STT/turn detector emits END_OF_SPEECH (i.e. end-of-turn detected)."""
        segment: list[rtc.AudioFrame] = []
        capturing = False

        async def _tee():
            async for frame in audio:
                if capturing:
                    segment.append(frame)
                yield frame

        async for event in Agent.default.stt_node(self, _tee(), model_settings):
            if event.type == SpeechEventType.START_OF_SPEECH:
                segment.clear()
                capturing = True
            elif event.type == SpeechEventType.END_OF_SPEECH:
                capturing = False
                self._save_turn_snippet(list(segment))
            yield event

    def _save_turn_snippet(self, frames: list[rtc.AudioFrame]) -> None:
        if not frames:
            return
        try:
            base_dir = session_store.get_session_dir()
        except RuntimeError:
            base_dir = "."
        turns_dir = os.path.join(base_dir, "turns")
        os.makedirs(turns_dir, exist_ok=True)

        self._turn_snippet_index += 1
        ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
        path = os.path.join(turns_dir, f"turn_{self._turn_snippet_index:03d}_{ts}.wav")

        with wave.open(path, "wb") as wav:
            wav.setnchannels(frames[0].num_channels)
            wav.setsampwidth(2)  # int16 PCM
            wav.setframerate(frames[0].sample_rate)
            for frame in frames:
                wav.writeframes(bytes(frame.data))

        duration = sum(f.samples_per_channel for f in frames) / frames[0].sample_rate
        logger.info(
            "Saved end-of-turn audio snippet: %s (%.2fs, %d frames)",
            path,
            duration,
            len(frames),
        )


    @function_tool()
    async def book_viewing(
        self,
        context: RunContext,
        date: str,
        time: str,
        customer_name: str = "Unknown",
        property_id: str | None = None,
    ) -> str:
        """Book a viewing for the property being discussed.

        Args:
            date: The date for the viewing (e.g., '2026-07-20').
            time: The time for the viewing (e.g., '14:00').
            customer_name: The name of the customer, if known.
            property_id: Listing to view; defaults to the one being discussed.
                Required in general search mode.
        """
        property_id = property_id or (
            str(self._property.get("property_id")) if self._property else None
        )
        booking_data = {
            "property_id": property_id,
            "date": date,
            "time": time,
            "customer_name": customer_name,
            "status": "confirmed",
        }
        session_store.save_booking_details(booking_data)
        if customer_name and customer_name != "Unknown":
            session_store.save_customer_details({"name": customer_name})
        logger.info("Viewing booked: %s", booking_data)
        return f"Viewing successfully booked for {date} at {time}."

    @function_tool()
    async def capture_customer_details(
        self,
        context: RunContext,
        name: str = "",
        email: str = "",
        phone: str = "",
    ) -> str:
        """Save the customer's contact details as they are shared during the call.

        Args:
            name: The customer's full name.
            email: The customer's email address.
            phone: The customer's phone number.
        """
        details = {"name": name, "email": email, "phone": phone}
        session_store.save_customer_details(details)
        logger.info("Captured customer details: %s", {k: v for k, v in details.items() if v})
        return "Customer details saved."

    @function_tool()
    async def save_call_details(self, context: RunContext, summary: str) -> str:
        """Save a summary of the call.

        Call this before ending the conversation. Include the property discussed,
        customer preferences, any viewing booked, and agreed next steps.

        Args:
            summary: A concise written summary of the call.
        """
        session_store.save_call_summary(summary)
        transcript = format_transcript(context.session.history)
        session_store.save_transcript(transcript)

        self._call_details_saved = True
        logger.info("Saved call summary to %s", session_store.get_session_dir())
        return "Call summary saved successfully."


def build_initial_context(prop: dict[str, Any] | None) -> ChatContext | None:
    """Preload the property's floor plan and photos so the agent can 'see' them.

    Images come pre-embedded in the dataset as low-detail base64 data URLs (see
    scripts/embed_property_images.py), so the bytes load directly with no network
    fetch. Any plain http URLs still work as a fallback."""
    ctx = ChatContext()
    if not prop:
        return ctx

    images = get_property_images(prop)
    content: list[Any] = [
        "Here are the floor plan and photos for the property we are discussing. "
        "Use them to answer questions about the layout and appearance:"
    ]
    for image in images:
        content.append(ImageContent(image=image, inference_detail="low"))

    if len(content) > 1:
        ctx.add_message(role="user", content=content)
    return ctx


server = AgentServer()

@server.rtc_session(agent_name="property-agent")
async def property_agent(ctx: agents.JobContext) -> None:
    metadata = _parse_metadata(getattr(ctx.job, "metadata", None))
    property_id = metadata.get("property_id")
    #property_id = "21932056"
    prop = get_property_by_id(property_id)
    if property_id and not prop:
        logger.warning("No property found for id %s", property_id)
    if not prop and not property_id and PROPERTIES:
        logger.info("No property_id in metadata; agent will ask the customer.")

    session_id = ctx.room.name if ctx.room else f"session_{datetime.now(UTC).strftime('%Y%m%d%H%M%S')}"
    session_store.start_session(session_id, property_id = str(property_id) if property_id else None)

    session = AgentSession(
        #vad=ai_coustics.VAD(),  # Add ai-coustics VAD to session setup
        # xAI for all three stages; each reads XAI_API_KEY from the environment.
        vad=vad,
        stt=xai.STT(language="en"),
        # xAI chat-completions endpoint. xai.responses.LLM currently crashes
        # parsing xAI's usage block (cache_write_tokens is null).
        llm=openai.LLM.with_x_ai(
            model=os.getenv("XAI_TEXT_MODEL") or "grok-4.20-0309-non-reasoning"
        ),
        tts=xai.TTS(
            voice=os.getenv("XAI_VOICE") or "ara",
            language="en",
            text_normalization=True,  # say "£2,500 pcm" the way a person would
        ),
        turn_handling=TurnHandlingOptions(
        #turn_detection=TurnDetector(),
        turn_detection="vad",          # Silero VAD decides end of turn
        endpointing=EndpointingOptions(
            mode="fixed",
            min_delay=0.2,             # Keep at 0 to avoid adding latency on top of STT decision
            max_delay=0.5,
        ),
        preemptive_generation={
            "preemptive_tts": True,
        },
        ),
    )

    turns: dict[str, dict[str, float]] = {}

    def _turn(speech_id: str) -> dict[str, float]:
        return turns.setdefault(speech_id, {})

    @session.on("metrics_collected")
    def _on_metrics(ev: MetricsCollectedEvent) -> None:
        m = ev.metrics
        if isinstance(m, STTMetrics):
            logger.debug(
                "STT chunk: audio %.2fs, rtt %.0f ms",
                m.audio_duration,
                m.duration * 1000,
            )
        elif isinstance(m, EOUMetrics):
            t = _turn(m.speech_id)
            t["eou"] = m.end_of_utterance_delay
            t["transcription_delay"] = m.transcription_delay
        elif isinstance(m, LLMMetrics):
            t = _turn(m.speech_id)
            t["llm_ttft"] = m.ttft
            t["llm_total"] = m.duration
            cache_pct = (
                100.0 * m.prompt_cached_tokens / m.prompt_tokens
                if m.prompt_tokens
                else 0.0
            )
            logger.info(
                "LLM tokens: prompt %d (cached %d, %.0f%%), completion %d, ttft %.0f ms",
                m.prompt_tokens,
                m.prompt_cached_tokens,
                cache_pct,
                m.completion_tokens,
                m.ttft * 1000,
            )
        elif isinstance(m, TTSMetrics):
            t = turns.pop(m.speech_id, {})
            eou = t.get("eou", 0.0)
            transcription_delay = t.get("transcription_delay", 0.0)
            endpoint_wait = max(eou - transcription_delay, 0.0)
            llm_ttft = t.get("llm_ttft", 0.0)
            llm_total = t.get("llm_total", 0.0)
            ttfb = m.ttfb
            perceived = eou + llm_ttft + ttfb
            logger.info(
                "\n"
                "──── turn latency breakdown (speech %s) ────\n"
                "  STT transcription_delay : %6.0f ms   (finalize text after you stop)\n"
                "  endpointing wait        : %6.0f ms   (turn-detector + min_delay)\n"
                "  = end_of_utterance_delay: %6.0f ms\n"
                "  LLM time-to-first-token : %6.0f ms\n"
                "  LLM total generation    : %6.0f ms\n"
                "  TTS time-to-first-byte  : %6.0f ms\n"
                "  ────────────────────────────────────────\n"
                "  PERCEIVED latency       : %6.0f ms   (eou + llm_ttft + tts_ttfb)",
                m.speech_id,
                transcription_delay * 1000,
                endpoint_wait * 1000,
                eou * 1000,
                llm_ttft * 1000,
                llm_total * 1000,
                ttfb * 1000,
                perceived * 1000,
            )

    agent = PropertyAgent(prop, chat_ctx=build_initial_context(prop))

    @session.on("close")
    def _on_close(ev: CloseEvent) -> None:
        if agent._call_details_saved:
            return

        summary = "Auto-saved on disconnect. The agent did not call save_call_details before the session ended."
        session_store.save_call_summary(summary)
        transcript = format_transcript(session.history)
        session_store.save_transcript(transcript)

        logger.info("Auto-saved call record on disconnect to %s", session_store.get_session_dir())

    await session.start(
        room=ctx.room,
        agent=agent,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                # noise_cancellation=noise_cancellation.BVC(),
                # sample_rate=24000,
                # num_channels=1,
                # frame_size_ms=50,
                # auto_gain_control=True,
                # pre_connect_audio=True,
                # pre_connect_audio_timeout=3.0,
                # noise_cancellation=ai_coustics.audio_enhancement(
                #   model=ai_coustics.EnhancerModel.QUAIL_VF_S,
                #   auth=ai_coustics.Auth.ai_coustics_api(license_key=os.getenv("AI_ACOUSTIC_API_KEY")),
                #   model_parameters=ai_coustics.ModelParameters(enhancement_level=0.8),
                # # vad_settings=ai_coustics.VadSettings(
                #   speech_hold_duration=0.03,
                #   sensitivity=6.0,
                #   minimum_speech_duration=0.1,
                # ),
                #),
            ),
        ),
    )

if __name__ == "__main__":
    agents.cli.run_app(server)
