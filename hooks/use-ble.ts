import { useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import {
  BleError,
  BleManager,
  Characteristic,
  Device,
} from "react-native-ble-plx";
import { fromByteArray, toByteArray } from "react-native-quick-base64";

type PermissionCallback = (result: boolean) => void;

const bleManager = new BleManager();

const pStreamingService = "a88abeae-8757-4ebf-bdef-d5f1c721d5e4";
const pEventChar = "0d13b83d-2684-47e5-aad4-24232365b381";
const pSendChar = "2ce59705-3ce3-411c-9d4f-a2daa41a034d";
const pResetChar = "03e85034-ab5e-4292-824d-c8e80c2a2e70";
const pStatusService = "eb1ef357-8127-481a-b8c5-df0edd94a059";
const pStatusChar = "f411405e-29b0-4a76-b931-065fd46e011d";
const pSetupService = "8add0583-abf6-4d44-9e5c-496818de399b";
const pSetupChar = "2a6fe703-276b-4573-af1f-0fa6269b46ff";

const STATUS_PACKET_MIN_LENGTH = 63;
const SETUP_PACKET_LENGTH = 25;
const IDLE_STATE_FLAG = 0;
export const ACQUIRING_STATE_FLAG = 1;
export const MAX_SPECTRUM_CHANNELS = 4096;
const MAX_DURATION_SECONDS = 0xffffffff;

export interface SpectrumAcquisitionConfig {
  channels: number;
  durationSeconds: number;
}

export interface SetupConfig {
  enableTempCorr: boolean;
  breakdownV: number;
  tempRef: number;
  tempFactor: number;
  vOvervoltage: number;
  thresholdMv: number;
  resetTimeNs: number;
}

export interface StatusChunk {
  totalPulses: number | null;
  cps: number | null;
  tempRp2350: number | null;
  tempMspm0: number | null;
  tempSipm: number | null;
  vboost: number | null;
  vTps: number | null;
  vbat: number | null;
  vbiasAct: number | null;
  thrAct: number | null;
  resetAct: number | null;
  framWrites: number | null;
  errors: number | null;
  adcOvf: number | null;
  rstStuck: number | null;
  enAmpOp: number | null;
  enBoost: number | null;
  enLdo: number | null;
}

const emptyStatusChunk: StatusChunk = {
  totalPulses: null,
  cps: null,
  tempRp2350: null,
  tempMspm0: null,
  tempSipm: null,
  vboost: null,
  vTps: null,
  vbat: null,
  vbiasAct: null,
  thrAct: null,
  resetAct: null,
  framWrites: null,
  errors: null,
  adcOvf: null,
  rstStuck: null,
  enAmpOp: null,
  enBoost: null,
  enLdo: null,
};

interface BluetoothLowEnergyApi {
  requestPermissions(callback: PermissionCallback): Promise<void>;
  scanForDevices(): void;
  allDevices: Device[];
  connectToDevice: (deviceId: Device) => Promise<void>;
  connectedDevice: Device | null;
  disconnectFromDevice: () => void;
  spectrumChunk: number[]; //declara o SpectrumChunk como um array
  spectrumState: number | null;
  statusChunk: StatusChunk;
  sendStatusTelemetry: () => Promise<void>;
  sendSpectrum: () => Promise<void>; //declara se quer que envie o espectro ou não
}

const clampInteger = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
};

const normalizeSpectrumConfig = (
  config?: SpectrumAcquisitionConfig,
): SpectrumAcquisitionConfig => ({
  channels: clampInteger(
    config?.channels ?? MAX_SPECTRUM_CHANNELS,
    1,
    MAX_SPECTRUM_CHANNELS,
  ),
  durationSeconds: clampInteger(
    config?.durationSeconds ?? 0,
    0,
    MAX_DURATION_SECONDS,
  ),
});

type BluetoothLowEnergyApiWithSpectrumConfig = Omit<
  BluetoothLowEnergyApi,
  "sendSpectrum"
> & {
  loadSpectrumData: (data: number[]) => void;
  pauseSpectrum: () => Promise<void>;
  readSetupConfig: () => Promise<void>;
  resetSpectrum: () => Promise<void>;
  sendSetupConfig: (config: SetupConfig) => Promise<void>;
  sendSpectrum: (config?: SpectrumAcquisitionConfig) => Promise<void>;
  setupConfig: SetupConfig | null;
};

const normalizeSpectrumData = (data: number[]) => {
  const spectrum = new Array(MAX_SPECTRUM_CHANNELS).fill(0);

  data.slice(0, MAX_SPECTRUM_CHANNELS).forEach((value, index) => {
    spectrum[index] = Number.isFinite(value) ? Math.max(value, 0) : 0;
  });

  return spectrum;
};

const parseSetupConfig = (rawData: Uint8Array): SetupConfig | null => {
  if (rawData.length < SETUP_PACKET_LENGTH) {
    console.log(`Setup packet incomplete: ${rawData.length} bytes`);
    return null;
  }

  const view = new DataView(
    rawData.buffer,
    rawData.byteOffset,
    rawData.byteLength,
  );

  return {
    enableTempCorr: view.getUint8(0) !== 0,
    breakdownV: view.getFloat32(1, true),
    tempRef: view.getFloat32(5, true),
    tempFactor: view.getFloat32(9, true),
    vOvervoltage: view.getFloat32(13, true),
    thresholdMv: view.getFloat32(17, true),
    resetTimeNs: view.getUint32(21, true),
  };
};

const serializeSetupConfig = (config: SetupConfig) => {
  const commandBytes = new Uint8Array(SETUP_PACKET_LENGTH);
  const view = new DataView(commandBytes.buffer);

  view.setUint8(0, config.enableTempCorr ? 1 : 0);
  view.setFloat32(1, config.breakdownV, true);
  view.setFloat32(5, config.tempRef, true);
  view.setFloat32(9, config.tempFactor, true);
  view.setFloat32(13, config.vOvervoltage, true);
  view.setFloat32(17, config.thresholdMv, true);
  view.setUint32(21, clampInteger(config.resetTimeNs, 0, 0xffffffff), true);

  return commandBytes;
};

export default function useBLE(): BluetoothLowEnergyApiWithSpectrumConfig {
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [spectrumChunk, setSpectrumChunk] = useState<number[]>(
    new Array(MAX_SPECTRUM_CHANNELS).fill(0),
  ); /*cria o estado do espectro e 
                                                                                           o inicializa totalmente nulo
                                                                                          */
  const [spectrumState, setSpectrumState] = useState<number | null>(null);
  const [statusChunk, setStatusChunk] =
    useState<StatusChunk>(emptyStatusChunk);
  const [setupConfig, setSetupConfig] = useState<SetupConfig | null>(null);
  const spectrumStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const spectrumAcquisitionActiveRef = useRef(false);
  const spectrumPauseRequestedRef = useRef(false);

  const clearSpectrumStopTimer = () => {
    if (spectrumStopTimeoutRef.current) {
      clearTimeout(spectrumStopTimeoutRef.current);
      spectrumStopTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      spectrumAcquisitionActiveRef.current = false;
      spectrumPauseRequestedRef.current = false;

      if (spectrumStopTimeoutRef.current) {
        clearTimeout(spectrumStopTimeoutRef.current);
        spectrumStopTimeoutRef.current = null;
      }
    };
  }, []);

  const requestPermissions = async (callback: PermissionCallback) => {
    if (Platform.OS === "android") {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        const isGranted =
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
            PermissionsAndroid.RESULTS.GRANTED;

        callback(isGranted);
        return;
      }

      const grantedStatus = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: "Location Permission",
          message: "Bluetooth Low Energy Needs Location Permission",
          buttonNegative: "Cancel",
          buttonPositive: "Ok",
          buttonNeutral: "Maybe later",
        },
      );

      callback(grantedStatus === PermissionsAndroid.RESULTS.GRANTED);
      return;
    }

    callback(true);
  };
  const isDuplicateDevice = (devices: Device[], nextDevice: Device) =>
    devices.findIndex((device) => nextDevice.id === device.id) > -1;

  const scanForDevices = async () => {
    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log(error);
      }
      if (device && device.name?.includes("RID_GAUG")) {
        setAllDevices((prevState) => {
          if (!isDuplicateDevice(prevState, device)) {
            return [...prevState, device];
          }
          return prevState;
        });
      }
    });
  };

  const connectToDevice = async (device: Device) => {
    try {
      const deviceConnection = await bleManager.connectToDevice(device.id);
      setConnectedDevice(deviceConnection);
      await deviceConnection.discoverAllServicesAndCharacteristics();
      bleManager.stopDeviceScan();

      if (Platform.OS === "android") {
        await deviceConnection.requestMTU(517); //solicita MTU para transmitir os 43 bytes corretamente e inteiramente
        console.log("MTU de 517 solicitado e negociado.");
      }
      startStreamingData(deviceConnection); // monta o serviço, a característica e inicia a transmissão
      startStatusTelemetry(deviceConnection);
      startSetupConfigTelemetry(deviceConnection);
    } catch (e) {
      console.log("ERROR IN CONNECTION", e);
    }
  };

  const disconnectFromDevice = () => {
    if (connectedDevice) {
      clearSpectrumStopTimer();
      spectrumAcquisitionActiveRef.current = false;
      spectrumPauseRequestedRef.current = false;
      bleManager.cancelDeviceConnection(connectedDevice.id);
      setConnectedDevice(null);
      setSpectrumState(null);
      setStatusChunk(emptyStatusChunk);
      setSetupConfig(null);
    }
  };

  const onSpectrumChunkUpdate = (
    error: BleError | null,
    characteristic: Characteristic | null,
  ) => {
    if (error) {
      console.log(error);
      return;
    } else if (!characteristic?.value) {
      console.log("No Data Recieved");
      return;
    }
    const rawData = toByteArray(characteristic.value); //transforma o envio de base 64 para um array de 43 posições, cada uma com 8 bytes
    const startBin = rawData[0] | (rawData[1] << 8); // startBin possui 2 bytes, [0] e [1]
    const flag = rawData[2];

    if (spectrumAcquisitionActiveRef.current) {
      setSpectrumState(ACQUIRING_STATE_FLAG);
    } else if (
      spectrumPauseRequestedRef.current &&
      flag === ACQUIRING_STATE_FLAG
    ) {
      setSpectrumState(IDLE_STATE_FLAG);
    } else {
      spectrumPauseRequestedRef.current = false;
      setSpectrumState(flag);
    }

    if (!spectrumAcquisitionActiveRef.current && flag !== ACQUIRING_STATE_FLAG) {
      clearSpectrumStopTimer();
    }

    const photonId: number[] = []; //cria um array para armazenar os 40 bytes de fótons
    for (let i = 0; i < 10; i++) {
      const offset = 3 + i * 4;

      const photonValue =
        (rawData[offset] |
          (rawData[offset + 1] << 8) |
          (rawData[offset + 2] << 16) |
          (rawData[offset + 3] << 24)) >>>
        0;
      photonId.push(photonValue);
    }
    setSpectrumChunk((prevSpectrum) => {
      //atualiza o estado do espectro
      const updated = [...prevSpectrum];
      photonId.forEach((count, index) => {
        //count é o valor atual e index a posição dele dentro do pacote
        const targetBin = startBin + index;
        if (targetBin < MAX_SPECTRUM_CHANNELS) {
          updated[targetBin] = count;
        }
      });
      return updated;
    });
  };

  const onStatusChunkUpdate = (
    error: BleError | null,
    characteristic: Characteristic | null,
  ) => {
    if (error) {
      console.log(error);
      return;
    } else if (!characteristic?.value) {
      console.log("No status data received");
      return;
    }

    const rawData = toByteArray(characteristic.value);
    if (rawData.length < STATUS_PACKET_MIN_LENGTH) {
      console.log(`Status packet incomplete: ${rawData.length} bytes`);
      return;
    }

    const view = new DataView(
      rawData.buffer,
      rawData.byteOffset,
      rawData.byteLength,
    );
    let offset = 0;

    const readUint32 = () => {
      const value = view.getUint32(offset, true);
      offset += 4;
      return value;
    };

    const readFloat32 = () => {
      const value = view.getFloat32(offset, true);
      offset += 4;
      return value;
    };

    const readUint8 = () => {
      const value = view.getUint8(offset);
      offset += 1;
      return value;
    };

    setStatusChunk({
      // --- Counters and Flags ---
      totalPulses: readUint32(),
      resetAct: readUint32(),     // C++: rst_ns_act
      errors: readUint32(),       // C++: err_flags
      adcOvf: readUint32(),       // C++: adc_ovf
      rstStuck: readUint32(),     // C++: rst_stuck
      framWrites: readUint32(),   // C++: mem_writes
  
      // --- Analog values and Setpoints ---
      cps: readFloat32(),
      vbiasAct: readFloat32(),
      thrAct: readFloat32(),
      tempSipm: readFloat32(),    // C++: t_sensor
      tempMspm0: readFloat32(),   // C++: t_mspm0_die
      tempRp2350: readFloat32(),  // C++: t_rp2350
      vboost: readFloat32(),
      vTps: readFloat32(),
      vbat: readFloat32(),

      // --- Booleans and small integers ---
      enAmpOp: readUint8(),
      enBoost: readUint8(),
      enLdo: readUint8(),

    });
  };

  const onSetupConfigUpdate = (
    error: BleError | null,
    characteristic: Characteristic | null,
  ) => {
    if (error) {
      console.log(error);
      return;
    } else if (!characteristic?.value) {
      console.log("No setup data received");
      return;
    }

    const setupConfigUpdate = parseSetupConfig(toByteArray(characteristic.value));

    if (setupConfigUpdate) {
      setSetupConfig(setupConfigUpdate);
    }
  };

  const sendStartCommand = async (config?: SpectrumAcquisitionConfig) => {
    if (!connectedDevice) {
      console.log("Nenhum dispositivo conectado");
      return null;
    }

    const acquisitionConfig = normalizeSpectrumConfig(config);

    try {
      const commandBytes = new Uint8Array(7);
      commandBytes[0] = 0x01;
      commandBytes[1] = acquisitionConfig.channels & 0xff;
      commandBytes[2] = (acquisitionConfig.channels >> 8) & 0xff;
      commandBytes[3] = acquisitionConfig.durationSeconds & 0xff;
      commandBytes[4] = (acquisitionConfig.durationSeconds >> 8) & 0xff;
      commandBytes[5] = (acquisitionConfig.durationSeconds >> 16) & 0xff;
      commandBytes[6] = (acquisitionConfig.durationSeconds >> 24) & 0xff;

      const commandBase64 = fromByteArray(commandBytes);

      await bleManager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        pStreamingService,
        pSendChar,
        commandBase64,
      );
      console.log("Comando de início enviado!");
      return acquisitionConfig;
    } catch (error) {
      console.log("Erro ao enviar comando de ínicio: ", error);
      return null;
    }
  };

  const sendStopCommand = async () => {
    if (!connectedDevice) {
      console.log("Nenhum dispositivo conectado");
      return;
    }

    try {
      const commandBytes = new Uint8Array([0x00]);
      const commandBase64 = fromByteArray(commandBytes);

      await bleManager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        pStreamingService,
        pSendChar,
        commandBase64,
      );
      console.log("Comando de fim enviado!");
    } catch (error) {
      console.log("Erro ao enviar comando de fim: ", error);
    }
  };

  const pauseSpectrum = async () => {
    clearSpectrumStopTimer();
    spectrumAcquisitionActiveRef.current = false;
    spectrumPauseRequestedRef.current = true;
    setSpectrumState(IDLE_STATE_FLAG);

    await sendStopCommand();
  };

  const resetSpectrum = async () => {
    if (!connectedDevice) {
      console.log("Nenhum dispositivo conectado");
      return;
    }

    try {
      const commandBytes = new Uint8Array([0x01]);
      const commandBase64 = fromByteArray(commandBytes);

      await bleManager.writeCharacteristicWithoutResponseForDevice(
        connectedDevice.id,
        pStreamingService,
        pResetChar,
        commandBase64,
      );

      setSpectrumChunk(new Array(MAX_SPECTRUM_CHANNELS).fill(0));
      console.log("Comando de reset enviado!");
    } catch (error) {
      console.log("Erro ao enviar comando de reset: ", error);
    }
  };

  const loadSpectrumData = (data: number[]) => {
    setSpectrumChunk(normalizeSpectrumData(data));
  };

  const startStreamingData = async (device: Device) => {
    if (device) {
      device.monitorCharacteristicForService(
        pStreamingService,
        pEventChar,
        (error, characteristic) => onSpectrumChunkUpdate(error, characteristic),
      );
    } else {
      console.log("No device connected");
    }
  };

  const startStatusTelemetry = async (device: Device) => {
    if (device) {
      device.monitorCharacteristicForService(
        pStatusService,
        pStatusChar,
        (error, characteristic) => onStatusChunkUpdate(error, characteristic),
      );
    } else {
      console.log("No device connected");
    }
  };

  const readSetupConfig = async () => {
    if (!connectedDevice) {
      console.log("Nenhum dispositivo conectado");
      return;
    }

    try {
      const characteristic = await bleManager.readCharacteristicForDevice(
        connectedDevice.id,
        pSetupService,
        pSetupChar,
      );
      onSetupConfigUpdate(null, characteristic);
    } catch (error) {
      console.log("Erro ao ler configuração de setup: ", error);
    }
  };

  const sendSetupConfig = async (config: SetupConfig) => {
    if (!connectedDevice) {
      console.log("Nenhum dispositivo conectado");
      return;
    }

    try {
      const commandBase64 = fromByteArray(serializeSetupConfig(config));

      await bleManager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        pSetupService,
        pSetupChar,
        commandBase64,
      );
      setSetupConfig(config);
      console.log("Configuração de setup enviada!");
    } catch (error) {
      console.log("Erro ao enviar configuração de setup: ", error);
      throw error;
    }
  };

  const startSetupConfigTelemetry = async (device: Device) => {
    if (device) {
      device.monitorCharacteristicForService(
        pSetupService,
        pSetupChar,
        (error, characteristic) => onSetupConfigUpdate(error, characteristic),
      );

      try {
        const characteristic = await bleManager.readCharacteristicForDevice(
          device.id,
          pSetupService,
          pSetupChar,
        );
        onSetupConfigUpdate(null, characteristic);
      } catch (error) {
        console.log("Erro ao ler configuração inicial de setup: ", error);
      }
    } else {
      console.log("No device connected");
    }
  };

  const sendSpectrum = async (config?: SpectrumAcquisitionConfig) => {
    clearSpectrumStopTimer();

    const acquisitionConfig = await sendStartCommand(config);
    if (!acquisitionConfig) {
      return;
    }

    spectrumAcquisitionActiveRef.current = true;
    spectrumPauseRequestedRef.current = false;
    setSpectrumState(ACQUIRING_STATE_FLAG);
    setSpectrumChunk(new Array(MAX_SPECTRUM_CHANNELS).fill(0));

    if (acquisitionConfig.durationSeconds > 0) {
      spectrumStopTimeoutRef.current = setTimeout(() => {
        spectrumStopTimeoutRef.current = null;
        void pauseSpectrum();
      }, acquisitionConfig.durationSeconds * 1000);
    }
  };

  const sendStatusTelemetry = async () => {
    if (!connectedDevice) {
      console.log("Nenhum dispositivo conectado");
      return;
    }

    try {
      const characteristic = await bleManager.readCharacteristicForDevice(
        connectedDevice.id,
        pStatusService,
        pStatusChar,
      );
      onStatusChunkUpdate(null, characteristic);
    } catch (error) {
      console.log("Erro ao ler telemetria de status: ", error);
    }
  };

  return {
    requestPermissions,
    scanForDevices,
    allDevices,
    connectToDevice,
    connectedDevice,
    disconnectFromDevice,
    loadSpectrumData,
    readSetupConfig,
    spectrumChunk,
    spectrumState,
    setupConfig,
    pauseSpectrum,
    resetSpectrum,
    sendSetupConfig,
    sendSpectrum,
    statusChunk,
    sendStatusTelemetry,
  };
}
