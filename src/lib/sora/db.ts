import { supabase } from "@/lib/supabase";
import { toDbRow, toRecord } from "@/lib/sora/mapper";
import type { GenerationRecord, GenerationRow } from "@/lib/sora/types";

const TABLE = "generations";

export async function readRecords(): Promise<GenerationRecord[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erreur lecture generations: ${error.message}`);
  }

  return (data as GenerationRow[]).map(toRecord);
}

export async function readRecord(id: string): Promise<GenerationRecord> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(`Generation introuvable (${id}): ${error.message}`);
  }

  return toRecord(data as GenerationRow);
}

export async function upsertRecord(record: GenerationRecord): Promise<void> {
  const row = toDbRow(record);
  const { error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: "id" });

  if (error) {
    throw new Error(`Erreur sauvegarde generation: ${error.message}`);
  }
}

export async function upsertRecords(records: GenerationRecord[]): Promise<void> {
  if (records.length === 0) return;

  const rows = records.map(toDbRow);
  const { error } = await supabase
    .from(TABLE)
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`Erreur sauvegarde generations: ${error.message}`);
  }
}
