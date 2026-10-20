import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { isNative } from './platform'

/**
 * Takes a photo or picks one from the gallery (Android). Returns null on the web, where the file input is
 * used instead, or if the user cancels. The result feeds the same resize + image-host path as any photo.
 */
export async function pickPhoto(): Promise<File | null> {
  if (!isNative()) return null
  try {
    const photo = await Camera.getPhoto({
      source: CameraSource.Prompt,
      resultType: CameraResultType.Base64,
      quality: 90,
      width: 1600,
      correctOrientation: true,
    })
    if (!photo.base64String) return null
    const bin = atob(photo.base64String)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const type = `image/${photo.format === 'jpg' ? 'jpeg' : photo.format}`
    return new File([bytes], `photo-${Date.now()}.${photo.format}`, { type })
  } catch {
    return null // cancelled or permission denied
  }
}
