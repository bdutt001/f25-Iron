import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "chat:lastRead:";

const buildKey = (chatId: string) => `${STORAGE_PREFIX}${chatId}`;

export async function saveChatLastRead(chatId: string, timestamp: string) {
  if (!chatId || !timestamp) return;
  try {
    await AsyncStorage.setItem(buildKey(chatId), timestamp);
  } catch (error) {
    console.warn("Failed to persist chat last-read timestamp", error);
  }
}

export async function getChatLastRead(chatId: string) {
  if (!chatId) return null;
  try {
    return await AsyncStorage.getItem(buildKey(chatId));
  } catch (error) {
    console.warn("Failed to load chat last-read timestamp", error);
    return null;
  }
}

export async function getChatLastReadMap(chatIds: string[]) {
  if (!chatIds || chatIds.length === 0) return {};
  const keys = chatIds.map(buildKey);
  try {
    const values = await AsyncStorage.multiGet(keys);
    const map: Record<string, string> = {};
    for (const [key, value] of values) {
      if (!key || !value) continue;
      const chatId = key.replace(STORAGE_PREFIX, "");
      map[chatId] = value;
    }
    return map;
  } catch (error) {
    console.warn("Failed to load chat last-read map", error);
    return {};
  }
}
