import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import DeviceModal from '@/components/DeviceConnectionModal';
import { useBLEContext } from '@/contexts/BLEContext';
import { Colors } from '@/constants/theme';
import { ACQUIRING_STATE_FLAG } from '@/hooks/use-ble';

const palette = Colors.dark;
const loadingText = 'Carregando...';
const ridGaugLogo = require('../../assets/images/rid-gaug-logo-mask.png');

type HomeStatusRow = {
  label: string;
  value: string;
};

const stateLabels: Record<number, string> = {
  0: 'IDLE',
  [ACQUIRING_STATE_FLAG]: 'ACQUIRING',
};

const formatClock = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}`;
};

const formatState = (state: number | null) => {
  if (state === null) {
    return loadingText;
  }

  return stateLabels[state] ?? state.toString();
};

const formatInteger = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return loadingText;
  }

  return Math.trunc(value).toString();
};

const formatFloat = (value: number | null, fractionDigits = 2) => {
  if (value === null || !Number.isFinite(value)) {
    return loadingText;
  }

  return value.toFixed(fractionDigits);
};

export default function HomeScreen() {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const {
    requestPermissions,
    scanForDevices,
    allDevices,
    connectToDevice,
    connectedDevice,
    disconnectFromDevice,
    spectrumState,
    statusChunk,
  } = useBLEContext();

  const [liveSeconds, setLiveSeconds] = useState(0);
  const [realSeconds, setRealSeconds] = useState(0);
  const isAcquiring = spectrumState === ACQUIRING_STATE_FLAG;

  useEffect(() => {
    setLiveSeconds(0);
    setRealSeconds(0);
  }, [connectedDevice?.id]);

  useEffect(() => {
    if (!connectedDevice) {
      return;
    }

    const timer = setInterval(() => {
      setRealSeconds((currentSeconds) => currentSeconds + 1);

      if (isAcquiring) {
        setLiveSeconds((currentSeconds) => currentSeconds + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [connectedDevice, isAcquiring]);

  const connectedRows = useMemo<HomeStatusRow[]>(
    () => [
      { label: 'Estado:', value: formatState(spectrumState) },
      { label: 'Contagem:', value: formatInteger(statusChunk.totalPulses) },
      { label: 'CPS:', value: formatFloat(statusChunk.cps) },
      { label: 'Live', value: liveSeconds.toString() },
      { label: 'Real', value: realSeconds.toString() },
    ],
    [liveSeconds, realSeconds, spectrumState, statusChunk],
  );

  const hideModal = () => {
    setIsModalVisible(false);
  };

  const scanForPeripherals = () => {
    requestPermissions((isGranted: boolean) => {
      if (isGranted) {
        scanForDevices();
      }
    });
  };

  const handlePowerPress = () => {
    if (connectedDevice) {
      disconnectFromDevice();
      return;
    }

    scanForPeripherals();
    setIsModalVisible(true);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen} edges={['left', 'right']}>
        {connectedDevice ? (
          <>
            <View style={styles.connectedHeader}>
              <Image
                source={ridGaugLogo}
                style={styles.connectedLogo}
                tintColor={palette.primary}
              />
              <Text style={styles.brandTitle}>RID GAUG</Text>
              <Text style={styles.elapsedTime}>{formatClock(realSeconds)}</Text>
            </View>

            <View style={styles.homeStatusList}>
              {connectedRows.map((row) => (
                <View key={row.label} style={styles.homeStatusRow}>
                  <Text style={styles.homeStatusLabel}>{row.label}</Text>
                  <Text
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                    numberOfLines={1}
                    style={styles.homeStatusValue}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.connectedPowerGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Desconectar dispositivo"
                onPress={handlePowerPress}
                style={({ pressed }) => [
                  styles.connectedPowerButton,
                  pressed && styles.powerButtonPressed,
                ]}>
                <MaterialCommunityIcons name="power" size={54} color={palette.tint} />
              </Pressable>
              <Text style={styles.connectedStatusText}>conectado</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.header}>
              <Image
                source={ridGaugLogo}
                style={styles.connectedLogo}
                tintColor={palette.primary}
              />
              <Text style={[styles.welcome]}>Bem vindo!</Text>
            </View>

            <Text style={styles.devicePrompt}>Conecte seu dispositivo</Text>

            <View style={styles.powerGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Conectar dispositivo"
                onPress={handlePowerPress}
                style={({ pressed }) => [
                  styles.powerButton,
                  pressed && styles.powerButtonPressed,
                ]}>
                <MaterialCommunityIcons name="power" size={52} color={palette.secondaryText} />
              </Pressable>
              <Text style={styles.statusText}>desconectado</Text>
            </View>
          </>
        )}

        <DeviceModal
          closeModal={hideModal}
          visible={isModalVisible}
          connectToPeripheral={connectToDevice}
          devices={allDevices}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: palette.background,
  },
  header: {
    alignItems: 'center',
    marginTop: 100,
  },
  connectedHeader: {
    alignItems: 'center',
    marginTop: 72,
  },
  connectedLogo: {
    width: 90,
    height: 89,
    resizeMode: 'contain',
  },
  brandTitle: {
    marginTop: 8,
    color: palette.primary,
    fontSize: 20,
    fontWeight: '400',
    lineHeight: 24,
    textAlign: 'center',
  },
  elapsedTime: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 17,
    textAlign: 'center',
  },
  welcome: {
    marginTop: 8,
    color: palette.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
    textAlign: 'center',
  },
  devicePrompt: {
    position: 'absolute',
    top: '47.7%',
    color: palette.secondaryText,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
    textAlign: 'center',
  },
  powerGroup: {
    position: 'absolute',
    bottom: 128,
    alignItems: 'center',
  },
  homeStatusList: {
    alignItems: 'center',
    gap: 16,
    marginTop: 32,
    paddingHorizontal: 16,
    width: '100%',
  },
  homeStatusRow: {
    width: '100%',
    maxWidth: 320,
    height: 36,
    alignItems: 'center',
    borderColor: palette.primary,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 26,
  },
  homeStatusLabel: {
    width: 101,
    color: palette.primary,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 20,
  },
  homeStatusValue: {
    flex: 1,
    color: palette.text,
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 20,
  },
  powerButton: {
    width: 86,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.secondaryText,
    borderRadius: 43,
  },
  powerButtonPressed: {
    opacity: 0.72,
  },
  connectedPowerGroup: {
    position: 'absolute',
    bottom: 128,
    alignItems: 'center',
  },
  connectedPowerButton: {
    width: 98,
    height: 98,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.primary,
    borderRadius: 49,
  },
  connectedStatusText: {
    marginTop: 16,
    color: palette.tint,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '400',
    textAlign: 'center',
  },
  statusText: {
    marginTop: 12,
    color: palette.secondaryText,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '400',
    textAlign: 'center',
  },
});
