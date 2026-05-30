import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useBLEContext } from '@/contexts/BLEContext';
import { Colors } from '@/constants/theme';
import type { StatusChunk } from '@/hooks/use-ble';

const palette = Colors.dark;
const valuePlaceholder = '(insert value)';

type StatusRow = {
  label: string;
  value: string;
};

const formatFloat = (value: number | null, fractionDigits = 2) => {
  if (value === null || !Number.isFinite(value)) {
    return valuePlaceholder;
  }

  return value.toFixed(fractionDigits);
};

const formatInteger = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return valuePlaceholder;
  }

  return Math.trunc(value).toString();
};

const formatFlag = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return valuePlaceholder;
  }

  return value ? '1' : '0';
};

const getStatusRows = (
  statusChunk: StatusChunk,
  isBluetoothConnected: boolean,
): StatusRow[] => [
  { label: 'Temp RP2350:', value: formatFloat(statusChunk.tempRp2350) },
  { label: 'Temp MSPM0:', value: formatFloat(statusChunk.tempMspm0) },
  { label: 'Temp SiPM:', value: formatFloat(statusChunk.tempSipm) },
  { label: 'Vboost:', value: formatFloat(statusChunk.vboost) },
  { label: 'V TPS:', value: formatFloat(statusChunk.vTps) },
  { label: 'Vbat:', value: formatFloat(statusChunk.vbat) },
  { label: 'Vbias (act):', value: formatFloat(statusChunk.vbiasAct) },
  { label: 'Thr (act):', value: formatFloat(statusChunk.thrAct) },
  { label: 'Reset (act):', value: formatInteger(statusChunk.resetAct) },
  { label: 'FRAM writes:', value: formatInteger(statusChunk.framWrites) },
  { label: 'Errors:', value: formatInteger(statusChunk.errors) },
  { label: 'ADC ovf:', value: formatInteger(statusChunk.adcOvf) },
  { label: 'Rst stuck:', value: formatInteger(statusChunk.rstStuck) },
  { label: 'BT:', value: formatFlag(isBluetoothConnected ? 1 : 0) },
  { label: 'En AmpOp:', value: formatFlag(statusChunk.enAmpOp) },
  { label: 'En Boost:', value: formatFlag(statusChunk.enBoost) },
  { label: 'En LDO:', value: formatFlag(statusChunk.enLdo) },
];

export default function TabThreeScreen() {
    const { connectedDevice, statusChunk } = useBLEContext();
    const statusRows = getStatusRows(statusChunk, Boolean(connectedDevice));

    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.container}>
            {connectedDevice ? (
                <ScrollView
                  contentContainerStyle={styles.statusList}
                  showsVerticalScrollIndicator={false}>
                  {statusRows.map((row) => (
                    <View key={row.label} style={styles.statusRow}>
                      <Text style={styles.statusLabel}>{row.label}</Text>
                      <Text
                        adjustsFontSizeToFit
                        minimumFontScale={0.72}
                        numberOfLines={1}
                        style={styles.statusValue}>
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
            ) : (
                <View style={styles.emptyContainer}>
                    <Text style={[styles.text]}>Please connect your device</Text>
                </View>
            )}
            </SafeAreaView>
        </SafeAreaProvider>
    
    )

}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: palette.background,
    },
    statusList: {
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 28,
        paddingTop: 40,
        paddingBottom: 112,
    },
    statusRow: {
        width: '100%',
        maxWidth: 338,
        height: 27,
        alignItems: 'center',
        borderColor: palette.primary,
        borderRadius: 14,
        borderWidth: 1,
        flexDirection: 'row',
        paddingHorizontal: 19,
    },
    statusLabel: {
        width: 110,
        color: palette.primary,
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 17,
    },
    statusValue: {
        flex: 1,
        color: palette.text,
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 17,
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
})
