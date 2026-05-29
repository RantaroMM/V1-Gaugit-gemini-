import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import DeviceModal from '@/components/DeviceConnectionModal';
import { useBLEContext } from '@/contexts/BLEContext';
import { Colors } from '@/constants/theme';

const palette = Colors.dark;

function LogoMark() {
  return (
    <View style={styles.logoFrame}>
      <View style={styles.logoDiamond}>
        <MaterialCommunityIcons
          name="link-variant"
          size={25}
          color="#030303"
          style={styles.logoIcon}
        />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const {
    requestPermissions,
    scanForDevices,
    allDevices,
    connectToDevice,
    connectedDevice,
    disconnectFromDevice,
  } = useBLEContext();

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
        <View style={styles.header}>
          <LogoMark />
          <Text style={[styles.welcome]}>Bem vindo!</Text>
        </View>

        <Text style={styles.devicePrompt}>
          {connectedDevice ? connectedDevice.name ?? 'Dispositivo conectado' : 'Conecte seu dispositivo'}
        </Text>

        <View style={styles.powerGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={connectedDevice ? 'Desconectar dispositivo' : 'Conectar dispositivo'}
            onPress={handlePowerPress}
            style={({ pressed }) => [styles.powerButton, pressed && styles.powerButtonPressed]}>
            <MaterialCommunityIcons name="power" size={52} color={palette.secondaryText} />
          </Pressable>
          <Text style={styles.statusText}>{connectedDevice ? 'conectado' : 'desconectado'}</Text>
        </View>

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
  logoFrame: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoDiamond: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.primary,
    borderRadius: 7,
    transform: [{ rotate: '45deg' }],
  },
  logoIcon: {
    transform: [{ rotate: '-45deg' }],
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
    bottom: 148,
    alignItems: 'center',
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
  statusText: {
    marginTop: 12,
    color: palette.secondaryText,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '400',
    textAlign: 'center',
  },
});
