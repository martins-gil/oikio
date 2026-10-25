import { Platform } from 'react-native';

export type PickedPhoto = { uri: string; mime: string };
export type PickResult = { photo: PickedPhoto } | { error: 'denied' | 'unavailable' | 'cancelled' };

const MIME_OK = ['image/jpeg', 'image/png', 'image/webp'];

type PickerModule = typeof import('expo-image-picker');

// Carregada só quando é preciso: se a versão instalada da app ainda não traz o módulo da câmara, devolve null em vez de rebentar
function picker(): PickerModule | null {
  try {
    return require('expo-image-picker') as PickerModule;
  } catch {
    return null;
  }
}

// Tira uma foto ou escolhe uma da galeria. Qualidade reduzida: o talão lê-se bem e a foto fica pequena (limite de 5 MB).
export async function pickReceiptPhoto(source: 'camera' | 'library'): Promise<PickResult> {
  const ImagePicker = picker();
  if (!ImagePicker) return { error: 'unavailable' };
  try {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { error: 'denied' };
    }
    const options = { mediaTypes: ['images' as const], quality: 0.6, allowsEditing: false, exif: false };
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.[0]) return { error: 'cancelled' };
    const asset = result.assets[0];
    const mime = asset.mimeType && MIME_OK.includes(asset.mimeType) ? asset.mimeType : 'image/jpeg';
    return { photo: { uri: asset.uri, mime } };
  } catch {
    return { error: Platform.OS === 'web' ? 'unavailable' : 'denied' };
  }
}

export const extensionFor = (mime: string) => (mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg');
