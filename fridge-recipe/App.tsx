import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  analyzeFridgePhoto,
  OpenAIRecipeError,
} from './src/services/openaiRecipe';

const KEY_STORAGE = 'openai_api_key';

export default function App() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keyModal, setKeyModal] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(KEY_STORAGE);
        if (stored) setApiKey(stored);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const requestPermissions = useCallback(async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!cam.granted || !lib.granted) {
      Alert.alert(
        'Доступ',
        'Нужны разрешения камеры и галереи для съёмки и выбора фото.'
      );
      return false;
    }
    return true;
  }, []);

  const pickImage = useCallback(
    async (source: 'camera' | 'library') => {
      setError(null);
      setRecipe(null);
      const ok = await requestPermissions();
      if (!ok) return;

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.75,
        base64: true,
      };

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      if (!asset.base64) {
        setError('Не удалось получить изображение. Попробуйте другое фото.');
        return;
      }

      setImageUri(asset.uri);
      setBase64(asset.base64);
      setMimeType(asset.mimeType ?? 'image/jpeg');
    },
    [requestPermissions]
  );

  const saveKey = useCallback(async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      Alert.alert('Ключ', 'Вставьте API-ключ OpenAI.');
      return;
    }
    await SecureStore.setItemAsync(KEY_STORAGE, trimmed);
    setApiKey(trimmed);
    setKeyModal(false);
    setKeyInput('');
  }, [keyInput]);

  const clearKey = useCallback(async () => {
    await SecureStore.deleteItemAsync(KEY_STORAGE);
    setApiKey(null);
  }, []);

  const runAnalysis = useCallback(async () => {
    if (!apiKey) {
      setKeyModal(true);
      return;
    }
    if (!base64) {
      setError('Сначала сделайте фото или выберите снимок холодильника.');
      return;
    }

    setLoading(true);
    setError(null);
    setRecipe(null);
    const controller = new AbortController();

    try {
      const text = await analyzeFridgePhoto({
        base64,
        mimeType,
        apiKey,
        signal: controller.signal,
      });
      setRecipe(text);
    } catch (e) {
      if (e instanceof OpenAIRecipeError) {
        setError(e.message);
      } else if (e instanceof Error && e.name === 'AbortError') {
        setError('Запрос отменён');
      } else {
        setError(
          e instanceof Error ? e.message : 'Не удалось получить рецепт'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [apiKey, base64, mimeType]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Холодильник → рецепт</Text>
          <Text style={styles.subtitle}>
            Сфотографируйте открытый холодильник — ИИ предложит блюдо и опишет
            рецепт.
          </Text>

          <View style={styles.keyRow}>
            <Text style={styles.keyHint}>
              {apiKey ? 'Ключ OpenAI сохранён' : 'Нужен ключ OpenAI API'}
            </Text>
            <Pressable
              onPress={() => setKeyModal(true)}
              style={({ pressed }) => [
                styles.keyBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.keyBtnText}>
                {apiKey ? 'Изменить' : 'Указать ключ'}
              </Text>
            </Pressable>
            {apiKey ? (
              <Pressable onPress={clearKey} style={styles.clearKey}>
                <Text style={styles.clearKeyText}>Удалить</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => pickImage('camera')}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryBtnText}>Сфотографировать</Text>
            </Pressable>
            <Pressable
              onPress={() => pickImage('library')}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryBtnText}>Из галереи</Text>
            </Pressable>
          </View>

          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.preview}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>
                Здесь появится превью фото
              </Text>
            </View>
          )}

          <Pressable
            onPress={runAnalysis}
            disabled={loading}
            style={({ pressed }) => [
              styles.analyzeBtn,
              loading && styles.analyzeBtnDisabled,
              pressed && !loading && styles.pressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#0f1419" />
            ) : (
              <Text style={styles.analyzeBtnText}>Предложить блюдо</Text>
            )}
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {recipe ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>Результат</Text>
              <Text style={styles.recipeText}>{recipe}</Text>
            </View>
          ) : null}
        </ScrollView>

        <Modal
          visible={keyModal}
          animationType="slide"
          transparent
          onRequestClose={() => setKeyModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Ключ OpenAI</Text>
              <Text style={styles.modalHint}>
                Создайте ключ на platform.openai.com и вставьте сюда. Он
                хранится только на устройстве.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="sk-..."
                placeholderTextColor="#6b7a78"
                secureTextEntry
                value={keyInput}
                onChangeText={setKeyInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => {
                    setKeyModal(false);
                    setKeyInput('');
                  }}
                  style={styles.modalCancel}
                >
                  <Text style={styles.modalCancelText}>Отмена</Text>
                </Pressable>
                <Pressable onPress={saveKey} style={styles.modalSave}>
                  <Text style={styles.modalSaveText}>Сохранить</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0f1419',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#e8f4f1',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#9ebbb5',
    lineHeight: 22,
    marginBottom: 20,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  keyHint: {
    flex: 1,
    minWidth: 120,
    color: '#7a9e96',
    fontSize: 14,
  },
  keyBtn: {
    backgroundColor: '#1e2e2c',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d4540',
  },
  keyBtnText: {
    color: '#5ad4c0',
    fontWeight: '600',
    fontSize: 14,
  },
  clearKey: {
    paddingVertical: 8,
  },
  clearKeyText: {
    color: '#c77b7b',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.85,
  },
  actions: {
    gap: 12,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: '#5ad4c0',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#0f1419',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#1c2526',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d4540',
  },
  secondaryBtnText: {
    color: '#c8e8e2',
    fontSize: 17,
    fontWeight: '600',
  },
  preview: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: 16,
    backgroundColor: '#1c2526',
  },
  placeholder: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    backgroundColor: '#1a2223',
    borderWidth: 1,
    borderColor: '#2d4540',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  placeholderText: {
    color: '#5c6e6b',
    fontSize: 15,
  },
  analyzeBtn: {
    backgroundColor: '#3d9b8a',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  analyzeBtnDisabled: {
    opacity: 0.6,
  },
  analyzeBtnText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  error: {
    color: '#ff9b9b',
    fontSize: 15,
    marginBottom: 12,
    lineHeight: 22,
  },
  resultBox: {
    backgroundColor: '#1c2526',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2d4540',
  },
  resultTitle: {
    color: '#5ad4c0',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  recipeText: {
    color: '#dceae7',
    fontSize: 15,
    lineHeight: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#1c2526',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2d4540',
  },
  modalTitle: {
    color: '#e8f4f1',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalHint: {
    color: '#9ebbb5',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#0f1419',
    borderRadius: 12,
    padding: 14,
    color: '#e8f4f1',
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2d4540',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  modalCancelText: {
    color: '#9ebbb5',
    fontSize: 16,
  },
  modalSave: {
    backgroundColor: '#5ad4c0',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  modalSaveText: {
    color: '#0f1419',
    fontWeight: '700',
    fontSize: 16,
  },
});
