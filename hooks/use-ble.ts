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

interface BluetoothLowEnergyApi {
  requestPermissions(callback: PermissionCallback): Promise<void>;
  scanForDevices(): void;
  allDevices: Device[];
  connectToDevice: (deviceId: Device) => Promise<void>;
  connectedDevice: Device | null;
  disconnectFromDevice: () => void;
  spectrumChunk: number[]; //declara o SpectrumChunk como um array
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
    } catch (e) {
      console.log("ERROR IN CONNECTION", e);
    }
  };

  const disconnectFromDevice = () => {
    if (connectedDevice) {
      bleManager.cancelDeviceConnection(connectedDevice.id);
      setConnectedDevice(null);
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
    const flag = rawData[2]; // a flag possui só 1 byte, [2]

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

  const sendSpectrum = async () => {
    await sendStartCommand();
  };

  return {
    requestPermissions,
    scanForDevices,
    allDevices,
    connectToDevice,
    connectedDevice,
    disconnectFromDevice,
    spectrumChunk,
    sendSpectrum,
  };
}
