import { getSupabase } from "@/lib/supabase";
import { toDbRow, toDemoAsset, toDemoAssetRow, toRecord } from "@/lib/sora/mapper";
import type { DemoAsset, DemoAssetRow, GenerationRecord, GenerationRow } from "@/lib/sora/types";

const TABLE = "generations";
const DEMOS_TABLE = "demo_assets";

export async function readRecords(): Promise<GenerationRecord[]> {
  const supabase = getSupabase() as any;
  const { data, error } = await supabase
    .schema("ugc_generation")
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erreur lecture generations: ${error.message}`);
  }

  return (data as GenerationRow[]).map(toRecord);
}

export async function readRecord(id: string): Promise<GenerationRecord> {
  const supabase = getSupabase() as any;
  const { data, error } = await supabase
    .schema("ugc_generation")
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
  const supabase = getSupabase() as any;
  const row = toDbRow(record);
  const { error } = await supabase
    .schema("ugc_generation")
    .from(TABLE)
    .upsert(row as never, { onConflict: "id" });

  if (error) {
    throw new Error(`Erreur sauvegarde generation: ${error.message}`);
  }
}

export async function upsertRecords(records: GenerationRecord[]): Promise<void> {
  if (records.length === 0) return;

  const supabase = getSupabase() as any;
  const rows = records.map(toDbRow);
  const { error } = await supabase
    .schema("ugc_generation")
    .from(TABLE)
    .upsert(rows as never, { onConflict: "id" });

  if (error) {
    throw new Error(`Erreur sauvegarde generations: ${error.message}`);
  }
}

export async function readDemoAssets(): Promise<DemoAsset[]> {
  const supabase = getSupabase() as any;
  const { data, error } = await supabase
    .schema("ugc_generation")
    .from(DEMOS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Erreur lecture demos: ${error.message}`);
  }

  return (data as DemoAssetRow[]).map(toDemoAsset);
}

export async function readDemoAsset(id: string): Promise<DemoAsset> {
  const supabase = getSupabase() as any;
  const { data, error } = await supabase
    .schema("ugc_generation")
    .from(DEMOS_TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(`Demo introuvable (${id}): ${error.message}`);
  }

  return toDemoAsset(data as DemoAssetRow);
}

export async function insertDemoAsset(asset: DemoAsset): Promise<void> {
  const supabase = getSupabase() as any;
  const row = toDemoAssetRow(asset);
  const { error } = await supabase
    .schema("ugc_generation")
    .from(DEMOS_TABLE)
    .insert(row as never);

  if (error) {
    throw new Error(`Erreur creation demo: ${error.message}`);
  }
}

export async function updateDemoAsset(asset: DemoAsset): Promise<void> {
  const supabase = getSupabase() as any;
  const row = toDemoAssetRow(asset);
  const { error } = await supabase
    .schema("ugc_generation")
    .from(DEMOS_TABLE)
    .update(row as never)
    .eq("id", asset.id);

  if (error) {
    throw new Error(`Erreur mise a jour demo: ${error.message}`);
  }
}
