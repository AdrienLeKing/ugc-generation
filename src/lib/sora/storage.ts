import { getSupabase } from "@/lib/supabase";

const BUCKET = "ugc-videos";

export async function uploadImage(buffer: Buffer, fileName: string): Promise<string> {
  const supabase = getSupabase();
  const path = `uploads/${fileName}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    throw new Error(`Erreur upload image: ${error.message}`);
  }

  return getPublicUrl(path);
}

export async function uploadVideo(videoId: string, buffer: ArrayBuffer): Promise<string> {
  const supabase = getSupabase();
  const path = `generated/${videoId}.mp4`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (error) {
    throw new Error(`Erreur upload video: ${error.message}`);
  }

  return getPublicUrl(path);
}

export async function uploadAudio(path: string, buffer: Buffer, contentType: string): Promise<string> {
  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Erreur upload audio: ${error.message}`);
  }

  return getPublicUrl(path);
}

export function getPublicUrl(path: string): string {
  const supabase = getSupabase();
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
