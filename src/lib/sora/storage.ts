import { getSupabase } from "@/lib/supabase";

const BUCKET = "ugc-videos";

async function uploadToBucket(path: string, body: Buffer | ArrayBuffer, contentType: string) {
  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Erreur upload fichier: ${error.message}`);
  }

  return getPublicUrl(path);
}

export async function uploadImage(buffer: Buffer, fileName: string): Promise<string> {
  const path = `uploads/${fileName}`;
  return uploadToBucket(path, buffer, "image/png");
}

export async function uploadVideo(videoId: string, buffer: ArrayBuffer): Promise<string> {
  const path = `generated/${videoId}.mp4`;
  return uploadToBucket(path, buffer, "video/mp4");
}

export async function uploadAudio(path: string, buffer: Buffer, contentType: string): Promise<string> {
  return uploadToBucket(path, buffer, contentType);
}

export async function uploadDemoVideo(fileName: string, buffer: Buffer, contentType: string): Promise<string> {
  return uploadToBucket(`demos/${fileName}`, buffer, contentType || "video/mp4");
}

export async function uploadFinalVideo(fileName: string, buffer: Buffer): Promise<string> {
  return uploadToBucket(`final/${fileName}`, buffer, "video/mp4");
}

export function getPublicUrl(path: string): string {
  const supabase = getSupabase();
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
