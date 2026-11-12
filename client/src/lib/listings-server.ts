import "server-only";

import { getAllProperties } from "./properties";
import { toSummary, type ListingSummary } from "./listing-summary";

export async function getListingSummaries(): Promise<ListingSummary[]> {
  return (await getAllProperties()).map(toSummary);
}
