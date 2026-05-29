import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import SpectrumChart from '@/components/SpectrumChart';
import { useBLEContext } from '@/contexts/BLEContext';
import { useThemeColor } from '@/hooks/use-theme-color';

export default function TabTwoScreen() {
  const { connectedDevice, spectrumChunk, sendSpectrum } = useBLEContext();
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const secondaryTextColor = useThemeColor({}, 'secondaryText');

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, { backgroundColor }]}>
        {connectedDevice ? (
          <View style={styles.chartContainer}>
            <SpectrumChart data={spectrumChunk} onPress={sendSpectrum} />
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={[styles.text, { color: secondaryTextColor }]}>Please connect your device</Text>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  },
});
