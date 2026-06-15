import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { KeyboardTypeOptions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useBLEContext } from '@/contexts/BLEContext';
import type { SetupConfig } from '@/hooks/use-ble';

const palette = Colors.dark;

type SetupFormState = {
  enableTempCorr: boolean;
  breakdownV: string;
  tempRef: string;
  tempFactor: string;
  vOvervoltage: string;
  thresholdMv: string;
  resetTimeNs: string;
};

type SetupInputRowProps = {
  editable?: boolean;
  keyboardType?: KeyboardTypeOptions;
  label: string;
  onChangeText?: (value: string) => void;
  value: string;
};

const emptySetupForm: SetupFormState = {
  enableTempCorr: false,
  breakdownV: '',
  tempRef: '',
  tempFactor: '',
  vOvervoltage: '',
  thresholdMv: '',
  resetTimeNs: '',
};

const formatDecimal = (value: number, fractionDigits: number) => {
  if (!Number.isFinite(value)) {
    return '';
  }

  return value.toFixed(fractionDigits).replace('.', ',');
};

const formatFlexibleDecimal = (value: number, fractionDigits: number) => {
  if (!Number.isFinite(value)) {
    return '';
  }

  const formatted = value.toFixed(fractionDigits).replace(/\.?0+$/, '');

  return formatted.replace('.', ',');
};

const parseDecimalText = (value: string) => {
  const normalizedValue = value.trim().replace(',', '.');

  if (!normalizedValue) {
    return null;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const parseResetTime = (value: string) => {
  const numericValue = parseDecimalText(value);

  if (numericValue === null) {
    return null;
  }

  return Math.min(Math.max(Math.trunc(numericValue), 0), 0xffffffff);
};

const setupConfigToForm = (config: SetupConfig): SetupFormState => ({
  enableTempCorr: config.enableTempCorr,
  breakdownV: formatDecimal(config.breakdownV, 3),
  tempRef: formatFlexibleDecimal(config.tempRef, 2),
  tempFactor: formatDecimal(config.tempFactor, 4),
  vOvervoltage: formatDecimal(config.vOvervoltage, 3),
  thresholdMv: formatDecimal(config.thresholdMv, 1),
  resetTimeNs: Math.trunc(config.resetTimeNs).toString(),
});

const setupFormToConfig = (form: SetupFormState): SetupConfig | null => {
  const breakdownV = parseDecimalText(form.breakdownV);
  const tempRef = parseDecimalText(form.tempRef);
  const tempFactor = parseDecimalText(form.tempFactor);
  const vOvervoltage = parseDecimalText(form.vOvervoltage);
  const thresholdMv = parseDecimalText(form.thresholdMv);
  const resetTimeNs = parseResetTime(form.resetTimeNs);

  if (
    breakdownV === null ||
    tempRef === null ||
    tempFactor === null ||
    vOvervoltage === null ||
    thresholdMv === null ||
    resetTimeNs === null
  ) {
    return null;
  }

  return {
    enableTempCorr: form.enableTempCorr,
    breakdownV,
    tempRef,
    tempFactor,
    vOvervoltage,
    thresholdMv,
    resetTimeNs,
  };
};

export default function SetupScreen() {
  const {
    connectedDevice,
    readSetupConfig,
    sendSetupConfig,
    setupConfig,
  } = useBLEContext();
  const [form, setForm] = useState<SetupFormState>(emptySetupForm);
  const [isSending, setIsSending] = useState(false);
  const readSetupConfigRef = useRef(readSetupConfig);

  useEffect(() => {
    readSetupConfigRef.current = readSetupConfig;
  }, [readSetupConfig]);

  useEffect(() => {
    if (connectedDevice?.id) {
      void readSetupConfigRef.current();
    }
  }, [connectedDevice?.id]);

  useEffect(() => {
    if (setupConfig) {
      setForm(setupConfigToForm(setupConfig));
    }
  }, [setupConfig]);

  const vbias = useMemo(() => {
    const breakdownV = parseDecimalText(form.breakdownV);
    const vOvervoltage = parseDecimalText(form.vOvervoltage);

    if (breakdownV === null || vOvervoltage === null) {
      return '';
    }

    return `${formatDecimal(breakdownV + vOvervoltage, 3)} V`;
  }, [form.breakdownV, form.vOvervoltage]);

  const updateFormField = (
    field: keyof Omit<SetupFormState, 'enableTempCorr'>,
    value: string,
  ) => {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  };

  const handleSendSetupConfig = async () => {
    if (isSending) {
      return;
    }

    const nextConfig = setupFormToConfig(form);

    if (!nextConfig) {
      Alert.alert('Valores inválidos', 'Revise os campos antes de enviar.');
      return;
    }

    setIsSending(true);

    try {
      await sendSetupConfig(nextConfig);
      Alert.alert('Setup enviado', 'Os valores foram enviados ao dispositivo.');
    } catch (error) {
      console.log('Erro ao enviar setup: ', error);
      Alert.alert('Erro', 'Não foi possível enviar os valores.');
    } finally {
      setIsSending(false);
    }
  };

  const renderDisconnected = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>Conecte seu dispositivo</Text>
    </View>
  );

  const renderSetup = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboardView}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.toggleGroup}>
          <Text style={styles.title}>enable temp correction</Text>
          <Switch
            accessibilityLabel="Enable temp correction"
            onValueChange={(value) =>
              setForm((currentForm) => ({
                ...currentForm,
                enableTempCorr: value,
              }))
            }
            thumbColor={form.enableTempCorr ? palette.primary : '#9a9a9a'}
            trackColor={{ false: '#020202', true: '#020202' }}
            value={form.enableTempCorr}
          />
        </View>

        <View style={styles.inputList}>
          <SetupInputRow
            keyboardType="numbers-and-punctuation"
            label="Breakdown V (V):"
            onChangeText={(value) => updateFormField('breakdownV', value)}
            value={form.breakdownV}
          />
          <SetupInputRow
            keyboardType="numbers-and-punctuation"
            label="@ Ref (°C):"
            onChangeText={(value) => updateFormField('tempRef', value)}
            value={form.tempRef}
          />
          <SetupInputRow
            keyboardType="numbers-and-punctuation"
            label="Factor (V/°C):"
            onChangeText={(value) => updateFormField('tempFactor', value)}
            value={form.tempFactor}
          />
          <SetupInputRow
            keyboardType="numbers-and-punctuation"
            label="Vovervoltage (V):"
            onChangeText={(value) => updateFormField('vOvervoltage', value)}
            value={form.vOvervoltage}
          />
          <SetupInputRow editable={false} label="Vbias:" value={vbias} />
          <SetupInputRow
            keyboardType="numbers-and-punctuation"
            label="Threshold (mV):"
            onChangeText={(value) => updateFormField('thresholdMv', value)}
            value={form.thresholdMv}
          />
          <SetupInputRow
            keyboardType="number-pad"
            label="Reset time (ns):"
            onChangeText={(value) => updateFormField('resetTimeNs', value)}
            value={form.resetTimeNs}
          />
        </View>

        <Pressable
          accessibilityLabel="Enviar para dispositivo"
          accessibilityRole="button"
          disabled={isSending}
          onPress={handleSendSetupConfig}
          style={({ pressed }) => [
            styles.sendButton,
            isSending && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.sendButtonText}>Enviar para dispositivo</Text>
          <MaterialCommunityIcons
            name="arrow-up-bold-circle"
            size={17}
            color="#111111"
          />
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        {connectedDevice ? renderSetup() : renderDisconnected()}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function SetupInputRow({
  editable = true,
  keyboardType,
  label,
  onChangeText,
  value,
}: SetupInputRowProps) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      {editable ? (
        <TextInput
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          selectTextOnFocus
          style={styles.input}
          underlineColorAndroid="transparent"
          value={value}
        />
      ) : (
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.74}
          numberOfLines={1}
          style={styles.readonlyValue}>
          {value}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    minHeight: '100%',
    paddingBottom: 124,
    paddingHorizontal: 18,
    paddingTop: 72,
  },
  toggleGroup: {
    alignItems: 'center',
  },
  title: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
    marginBottom: 4,
    textAlign: 'center',
  },
  inputList: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
    marginTop: 58,
  },
  inputRow: {
    width: '100%',
    maxWidth: 394,
    height: 32,
    alignItems: 'center',
    borderColor: palette.primary,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 34,
  },
  inputLabel: {
    width: 160,
    color: palette.primary,
    fontSize: 17,
    fontWeight: '400',
    lineHeight: 21,
  },
  input: {
    flex: 1,
    color: palette.text,
    fontSize: 18,
    fontWeight: '400',
    includeFontPadding: false,
    lineHeight: 22,
    padding: 0,
  },
  readonlyValue: {
    flex: 1,
    color: palette.text,
    fontSize: 18,
    fontWeight: '400',
    lineHeight: 22,
  },
  sendButton: {
    height: 34,
    alignItems: 'center',
    backgroundColor: '#f2f4f5',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 68,
    paddingHorizontal: 18,
  },
  sendButtonText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 20,
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
