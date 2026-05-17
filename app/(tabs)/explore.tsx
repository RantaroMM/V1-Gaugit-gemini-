import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import useBLE from "@/hooks/use-ble"
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useBLEContext } from '@/contexts/BLEContext';

export default function TabTwoScreen() {

const {requestPermissions, 
        scanForDevices, 
        allDevices,
        connectToDevice,
        connectedDevice,
        disconnectFromDevice,
        spectrumChunk, sendSpectrum} = useBLEContext();

const send = async () => {
  sendSpectrum();
}
  

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <View style={styles.container}>
          {connectedDevice ? (
            
            <TouchableOpacity style={styles.button} onPress={send}>
              <Text style={styles.text}>Primeiros canais: {spectrumChunk.slice(0, 10).join(", ")}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.text}>Please connect your device</Text>
          )}

        </View>
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
  button: {
    alignItems: 'center',
    backgroundColor: "#DDDDDD",
    padding: 10,
  },
  text: {
    color: 'gray',
    fontSize: 24,
    textAlign: 'center',
  },
});
