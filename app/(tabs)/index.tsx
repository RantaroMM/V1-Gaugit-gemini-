import { View, Text , StyleSheet, TouchableOpacity} from 'react-native'
import React, { useState } from 'react'
import { BleManager, Device } from "react-native-ble-plx";
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import useBLE from "@/hooks/use-ble"
import DeviceModal from '@/components/DeviceConnectionModal';
import "react-native-quick-base64";
import { BLEProvider, useBLEContext } from '@/contexts/BLEContext';

export default function app() {

  const [isModalVisible, setIsModalVisible] = useState<boolean>(false);

  const {requestPermissions, 
        scanForDevices, 
        allDevices,
        connectToDevice,
        connectedDevice,
        disconnectFromDevice,
        } = useBLEContext();

  const hideModal = () =>{
    setIsModalVisible(false);
  };

  const scanForPeripherals = async () => {
    requestPermissions((isGranted: boolean) => {
      if(isGranted) {
        scanForDevices();
      }
    })
  }

  const openModal = async () => {
    scanForPeripherals();
    setIsModalVisible(true);
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>

        <View style={styles.container}>
          {connectedDevice ? (
            <><Text style={styles.text}>Your device is connected</Text></>
            
          ) : (
            <Text style={styles.text}>Please connect your device</Text>
          )}

          <Text style={styles.title}>FW-RID-RPico2W-SPI</Text>
          {allDevices.map((device: Device) => (
            <Text key={device.id} style={styles.text}>{device.name}</Text>
          ))
            
          }
        </View>
        
          <TouchableOpacity style={styles.button} onPress={connectedDevice ? disconnectFromDevice : openModal}>
          <Text style={styles.button}>
            {connectedDevice ? 'Disconnect' : 'Connect'}
          </Text>
        </TouchableOpacity>
    
        <DeviceModal
          closeModal={hideModal}
          visible={isModalVisible}
          connectToPeripheral={connectToDevice}
          devices={allDevices}
        />
      
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  title: {
    color: 'white',
    fontSize: 42,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  text: {
    color: 'gray',
    fontSize: 24,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    backgroundColor: "#DDDDDD",
    padding: 10,
  }
})