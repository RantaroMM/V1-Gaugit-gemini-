import { useState } from "react";
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
const pStatusService = "eb1ef357-8127-481a-b8c5-df0edd94a059";
const pStatusChar = "f411405e-29b0-4a76-b931-065fd46e011d";

const STATUS_PACKET_MIN_LENGTH = 63;
export const ACQUIRING_STATE_FLAG = 1;

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

export default function useBLE(): BluetoothLowEnergyApi {
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [spectrumChunk, setSpectrumChunk] = useState<number[]>(
    new Array(4096).fill(0),
  ); /*cria o estado do espectro e 
                                                                                           o inicializa totalmente nulo
                                                                                          */
  const [spectrumState, setSpectrumState] = useState<number | null>(null);
  const [statusChunk, setStatusChunk] =
    useState<StatusChunk>(emptyStatusChunk);

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
    } catch (e) {
      console.log("ERROR IN CONNECTION", e);
    }
  };

  const disconnectFromDevice = () => {
    if (connectedDevice) {
      bleManager.cancelDeviceConnection(connectedDevice.id);
      setConnectedDevice(null);
      setSpectrumState(null);
      setStatusChunk(emptyStatusChunk);
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

    setSpectrumState(flag);

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
        if (targetBin < 4096) {
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

  const sendStartCommand = async () => {
    if (!connectedDevice) {
      console.log("Nenhum dispositivo conectado");
      return;
    }

    try {
      const commandBytes = new Uint8Array([0x01]);
      const commandBase64 = fromByteArray(commandBytes);

      await bleManager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        pStreamingService,
        pSendChar,
        commandBase64,
      );
      console.log("Comando de início enviado!");
    } catch (error) {
      console.log("Erro ao enviar comando de ínicio: ", error);
    }
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

  const sendSpectrum = async () => {
    await sendStartCommand();
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
    spectrumChunk,
    spectrumState,
    sendSpectrum,
    statusChunk,
    sendStatusTelemetry,
  };
}
