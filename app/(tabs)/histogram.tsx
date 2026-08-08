import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';

import SpectrumChart from '@/components/SpectrumChart';
import { Colors } from '@/constants/theme';
import { useBLEContext } from '@/contexts/BLEContext';
import { ACQUIRING_STATE_FLAG, MAX_SPECTRUM_CHANNELS } from '@/hooks/use-ble';

const palette = Colors.dark;
const DEFAULT_DURATION_SECONDS = 30;
const SPECTRUM_DIRECTORY_NAME = 'spectra';
const SPECTRUM_LATEST_FILE_NAME = 'spectrum-latest.json';

type HistogramView = 'controls' | 'chart';

type AcquisitionInputRowProps = {
  accessibilityLabel: string;
  keyboardType?: KeyboardTypeOptions;
  label: string;
  onBlur: () => void;
  onChangeText: (value: string) => void;
  value: string;
};

type SpectrumFilePayload = {
  channels?: number;
  data?: unknown;
  durationSeconds?: number;
  savedAt?: string;
  version?: number;
};

type AcquisitionActionButtonProps = {
  accessibilityLabel: string;
  disabled?: boolean;
  iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
};

const clampInteger = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
};

const getSpectrumDirectory = () => {
  if (!FileSystem.documentDirectory) {
    throw new Error('Diretório de documentos indisponível.');
  }

  return `${FileSystem.documentDirectory}${SPECTRUM_DIRECTORY_NAME}/`;
};

const getSpectrumLatestFileUri = () => {
  return `${getSpectrumDirectory()}${SPECTRUM_LATEST_FILE_NAME}`;
};

const getSpectrumTimestampFileUri = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return `${getSpectrumDirectory()}spectrum-${timestamp}.json`;
};

const ensureSpectrumDirectory = async () => {
  await FileSystem.makeDirectoryAsync(getSpectrumDirectory(), {
    intermediates: true,
  });
};

const parseChannels = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  return clampInteger(Number.parseInt(digits, 10), 1, MAX_SPECTRUM_CHANNELS);
};

const formatDuration = (totalSeconds: number) => {
  const safeSeconds = Math.max(Math.trunc(totalSeconds), 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
};

const parseDuration = (value: string) => {
  const text = value.trim().toLowerCase();
  if (!text) {
    return null;
  }

  let totalSeconds = 0;
  let matchedUnit = false;

  text.replace(/(\d+)\s*([hms])/g, (_match, amount: string, unit: string) => {
    matchedUnit = true;
    const parsedAmount = Number.parseInt(amount, 10);

    if (unit === 'h') {
      totalSeconds += parsedAmount * 3600;
    } else if (unit === 'm') {
      totalSeconds += parsedAmount * 60;
    } else {
      totalSeconds += parsedAmount;
    }

    return '';
  });

  if (matchedUnit) {
    return Math.max(totalSeconds, 0);
  }

  if (text.includes(':')) {
    const parts = text.split(':').map((part) => Number.parseInt(part, 10));
    if (parts.some((part) => Number.isNaN(part))) {
      return null;
    }

    if (parts.length === 3) {
      return Math.max(parts[0] * 3600 + parts[1] * 60 + parts[2], 0);
    }

    if (parts.length === 2) {
      return Math.max(parts[0] * 60 + parts[1], 0);
    }

    return null;
  }

  const digits = text.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  return Math.max(Number.parseInt(digits, 10), 0);
};

const normalizeLoadedSpectrum = (value: unknown) => {
  const payload =
    value && typeof value === 'object' ? (value as SpectrumFilePayload) : {};
  const rawData = Array.isArray(value)
    ? value
    : Array.isArray(payload.data)
      ? payload.data
      : null;

  if (!rawData) {
    return null;
  }

  const data = new Array(MAX_SPECTRUM_CHANNELS).fill(0);

  rawData.slice(0, MAX_SPECTRUM_CHANNELS).forEach((item, index) => {
    const numericValue = Number(item);
    data[index] = Number.isFinite(numericValue) ? Math.max(numericValue, 0) : 0;
  });

  const channelsFromPayload =
    typeof payload.channels === 'number' && Number.isFinite(payload.channels)
      ? payload.channels
      : rawData.length;

  const durationFromPayload =
    typeof payload.durationSeconds === 'number' &&
    Number.isFinite(payload.durationSeconds)
      ? payload.durationSeconds
      : null;

  return {
    channels: clampInteger(channelsFromPayload, 1, MAX_SPECTRUM_CHANNELS),
    data,
    durationSeconds:
      durationFromPayload === null ? null : Math.max(durationFromPayload, 0),
  };
};

export default function HistogramScreen() {
  const {
    connectedDevice,
    loadSpectrumData,
    pauseSpectrum,
    resetSpectrum,
    spectrumChunk,
    spectrumState,
    sendSpectrum,
  } = useBLEContext();
  const [activeView, setActiveView] = useState<HistogramView>('controls');
  const [channelsText, setChannelsText] = useState(
    String(MAX_SPECTRUM_CHANNELS),
  );
  const [durationText, setDurationText] = useState(
    formatDuration(DEFAULT_DURATION_SECONDS),
  );
  const [isCommandPending, setIsCommandPending] = useState(false);
  const [isFilePending, setIsFilePending] = useState(false);

  const channels = useMemo(() => parseChannels(channelsText), [channelsText]);
  const durationSeconds = useMemo(
    () => parseDuration(durationText),
    [durationText],
  );
  const isAcquiring = spectrumState === ACQUIRING_STATE_FLAG;
  const acquisitionActionLabel = isAcquiring
    ? 'Pausar aquisição'
    : 'Começar aquisição';
  const isAcquisitionButtonDisabled =
    isCommandPending ||
    (!isAcquiring && (channels === null || durationSeconds === null));

  const handleChannelsChange = (value: string) => {
    const parsedChannels = parseChannels(value);

    if (parsedChannels === null) {
      setChannelsText('');
      return;
    }

    setChannelsText(String(parsedChannels));
  };

  const handleChannelsBlur = () => {
    setChannelsText(String(channels ?? MAX_SPECTRUM_CHANNELS));
  };

  const handleDurationBlur = () => {
    setDurationText(formatDuration(durationSeconds ?? 0));
  };

  const handleStartAcquisition = async () => {
    if (isAcquisitionButtonDisabled) {
      return;
    }

    const nextChannels = channels ?? MAX_SPECTRUM_CHANNELS;
    const nextDurationSeconds = durationSeconds ?? 0;

    setChannelsText(String(nextChannels));
    setDurationText(formatDuration(nextDurationSeconds));
    setIsCommandPending(true);

    try {
      await sendSpectrum({
        channels: nextChannels,
        durationSeconds: nextDurationSeconds,
      });
    } finally {
      setIsCommandPending(false);
    }
  };

  const handlePauseAcquisition = async () => {
    if (isCommandPending) {
      return;
    }

    setIsCommandPending(true);

    try {
      await pauseSpectrum();
    } finally {
      setIsCommandPending(false);
    }
  };

  const handleAcquisitionPress = () => {
    if (isAcquiring) {
      void handlePauseAcquisition();
      return;
    }

    void handleStartAcquisition();
  };

  const handleResetAcquisition = async () => {
    if (isCommandPending) {
      return;
    }

    setIsCommandPending(true);

    try {
      await resetSpectrum();
    } finally {
      setIsCommandPending(false);
    }
  };

  const handleSaveSpectrum = async () => {
    if (isFilePending) {
      return;
    }

    setIsFilePending(true);

    try {
      await ensureSpectrumDirectory();

      const nextChannels = channels ?? MAX_SPECTRUM_CHANNELS;
      const nextDurationSeconds = durationSeconds ?? 0;
      const savedAt = new Date().toISOString();
      const payload = {
        version: 1,
        savedAt,
        channels: nextChannels,
        durationSeconds: nextDurationSeconds,
        data: spectrumChunk.slice(0, nextChannels),
      };
      const json = JSON.stringify(payload, null, 2);
      const latestFileUri = getSpectrumLatestFileUri();
      const timestampFileUri = getSpectrumTimestampFileUri();

      await FileSystem.writeAsStringAsync(latestFileUri, json);
      await FileSystem.writeAsStringAsync(timestampFileUri, json);

      Alert.alert('Espectro salvo', 'O arquivo JSON foi salvo no app.');
    } catch (error) {
      console.log('Erro ao salvar espectro: ', error);
      Alert.alert('Erro', 'Não foi possível salvar o espectro.');
    } finally {
      setIsFilePending(false);
    }
  };

  const handleLoadSpectrum = async () => {
    if (isFilePending) {
      return;
    }

    setIsFilePending(true);

    try {
      const fileUri = getSpectrumLatestFileUri();
      const fileInfo = await FileSystem.getInfoAsync(fileUri);

      if (!fileInfo.exists) {
        Alert.alert('Nenhum espectro salvo', 'Salve um espectro antes de carregar.');
        return;
      }

      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      const loadedSpectrum = normalizeLoadedSpectrum(JSON.parse(fileContent));

      if (!loadedSpectrum) {
        Alert.alert('JSON inválido', 'O arquivo salvo não contém um espectro válido.');
        return;
      }

      loadSpectrumData(loadedSpectrum.data);
      setChannelsText(String(loadedSpectrum.channels));

      if (loadedSpectrum.durationSeconds !== null) {
        setDurationText(formatDuration(loadedSpectrum.durationSeconds));
      }

      Alert.alert('Espectro carregado', 'O gráfico foi atualizado com o JSON salvo.');
    } catch (error) {
      console.log('Erro ao carregar espectro: ', error);
      Alert.alert('Erro', 'Não foi possível carregar o espectro.');
    } finally {
      setIsFilePending(false);
    }
  };

  const renderDisconnected = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>Conecte seu dispositivo</Text>
    </View>
  );

  const renderChart = () => (
    <View style={styles.chartScreen}>
      <Pressable
        accessibilityLabel="Voltar para aquisição"
        accessibilityRole="button"
        onPress={() => setActiveView('controls')}
        style={({ pressed }) => [
          styles.backButton,
          pressed && styles.pressed,
        ]}>
        <MaterialCommunityIcons name="chevron-left" size={28} color={palette.text} />
      </Pressable>

      <View style={styles.chartContainer}>
        <SpectrumChart
          channelCount={channels ?? MAX_SPECTRUM_CHANNELS}
          data={spectrumChunk}
          style={styles.chart}
        />
      </View>
    </View>
  );

  const renderControls = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.controlsScreen}>
      <View style={styles.inputGroup}>
        <AcquisitionInputRow
          accessibilityLabel="Canais"
          keyboardType="number-pad"
          label="Canais:"
          onBlur={handleChannelsBlur}
          onChangeText={handleChannelsChange}
          value={channelsText}
        />

        <AcquisitionInputRow
          accessibilityLabel="Duração"
          keyboardType="numbers-and-punctuation"
          label="Duração"
          onBlur={handleDurationBlur}
          onChangeText={setDurationText}
          value={durationText}
        />

        <Text style={styles.durationHint}>0h 0m 0s = contínuo</Text>
      </View>

      <View style={styles.actionsGroup}>
        <AcquisitionActionButton
          accessibilityLabel={acquisitionActionLabel}
          disabled={isAcquisitionButtonDisabled}
          iconName={isAcquiring ? 'pause' : 'play'}
          label={acquisitionActionLabel}
          onPress={handleAcquisitionPress}
        />

        <AcquisitionActionButton
          accessibilityLabel="Resetar aquisição"
          disabled={isCommandPending}
          iconName="restart"
          label="Resetar aquisição"
          onPress={() => {
            void handleResetAcquisition();
          }}
        />

        <AcquisitionActionButton
          accessibilityLabel="Salvar espectro"
          disabled={isFilePending}
          iconName="content-save-outline"
          label="Salvar espectro"
          onPress={() => {
            void handleSaveSpectrum();
          }}
        />

        <AcquisitionActionButton
          accessibilityLabel="Carregar espectro"
          disabled={isFilePending}
          iconName="download-box-outline"
          label="Carregar espectro"
          onPress={() => {
            void handleLoadSpectrum();
          }}
        />
      </View>

      <Pressable
        accessibilityLabel="Visualizar gráfico"
        accessibilityRole="button"
        onPress={() => setActiveView('chart')}
        style={({ pressed }) => [
          styles.graphLink,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.graphLinkText}>Visualizar gráfico</Text>
        <MaterialCommunityIcons name="chevron-right" size={40} color={palette.primary} />
      </Pressable>
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        {connectedDevice
          ? activeView === 'chart'
            ? renderChart()
            : renderControls()
          : renderDisconnected()}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function AcquisitionInputRow({
  accessibilityLabel,
  keyboardType,
  label,
  onBlur,
  onChangeText,
  value,
}: AcquisitionInputRowProps) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        keyboardType={keyboardType}
        onBlur={onBlur}
        onChangeText={onChangeText}
        selectTextOnFocus
        style={styles.input}
        underlineColorAndroid="transparent"
        value={value}
      />
    </View>
  );
}

function AcquisitionActionButton({
  accessibilityLabel,
  disabled = false,
  iconName,
  label,
  onPress,
}: AcquisitionActionButtonProps) {
  return (
    <View style={styles.actionItem}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionButton,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}>
        <MaterialCommunityIcons name={iconName} size={22} color={palette.text} />
      </Pressable>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        numberOfLines={1}
        style={styles.actionText}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  controlsScreen: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    width: '100%',
  },
  inputGroup: {
    alignItems: 'center',
    gap: 6,
    position: 'absolute',
    top: '25%',
    width: '100%',
  },
  inputRow: {
    width: '100%',
    maxWidth: 320,
    height: 24,
    alignItems: 'center',
    borderColor: palette.primary,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 24,
  },
  inputLabel: {
    width: 116,
    color: palette.primary,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 15,
  },
  input: {
    flex: 1,
    color: palette.text,
    fontSize: 12,
    fontWeight: '400',
    includeFontPadding: false,
    lineHeight: 15,
    padding: 0,
  },
  durationHint: {
    color: palette.text,
    fontSize: 9,
    lineHeight: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  actionsGroup: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    top: '47%',
  },
  actionItem: {
    width: 74,
    alignItems: 'center',
  },
  actionButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: palette.primary,
    borderRadius: 19,
    borderWidth: 1,
  },
  actionText: {
    width: '100%',
    color: palette.text,
    fontSize: 7,
    fontWeight: '600',
    lineHeight: 9,
    marginTop: 10,
    textAlign: 'center',
  },
  graphLink: {
    width: '100%',
    maxWidth: 340,
    height: 68,
    alignItems: 'center',
    backgroundColor: '#020202',
    borderRadius: 8,
    bottom: 128,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 30,
    paddingRight: 28,
    position: 'absolute',
  },
  graphLinkText: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 21,
  },
  chartScreen: {
    flex: 1,
    width: '100%',
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    borderColor: palette.text,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    left: 10,
    position: 'absolute',
    top: 18,
    zIndex: 1,
  },
  chartContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingBottom: 104,
    paddingHorizontal: 14,
    paddingTop: 58,
  },
  chart: {
    width: '100%',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyText: {
    color: palette.secondaryText,
    fontSize: 24,
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.72,
  },
});
