import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import SpectrumChart from '@/components/SpectrumChart';
import { useBLEContext } from '@/contexts/BLEContext';
import { Colors } from '@/constants/theme';

const palette = Colors.dark;

export default function TabTwoScreen() {
  const { connectedDevice, spectrumChunk, sendSpectrum } = useBLEContext();
  
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container]}>
        {connectedDevice ? (
          <View style={styles.chartContainer}>
            <SpectrumChart data={spectrumChunk} onPress={sendSpectrum} />
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={[styles.text]}>Please connect your device</Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  chartContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  text: {
    fontSize: 24,
    textAlign: 'center',
    color: palette.secondaryText,
  },
});
