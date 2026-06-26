import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, {FC, useCallback} from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Modal,
  Text,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {Device} from 'react-native-ble-plx';
import { SafeAreaProvider } from 'react-native-safe-area-context';

type DeviceModalListItemProps = {
  item: ListRenderItemInfo<Device>;
  connectToPeripheral: (device: Device) => void;
  closeModal: () => void;
};

type DeviceModalProps = {
  devices: Device[];
  visible: boolean;
  connectToPeripheral: (device: Device) => void;
  closeModal: () => void;
};

const DeviceModalListItem: FC<DeviceModalListItemProps> = props => {
  const {item, connectToPeripheral, closeModal} = props;

  const connectAndCloseModal = useCallback(() => {
    connectToPeripheral(item.item);
    closeModal();
  }, [closeModal, connectToPeripheral, item.item]);

  return (
    <TouchableOpacity
      onPress={connectAndCloseModal}
      style={modalStyle.ctaButton}>
      <Text style={modalStyle.ctaButtonText}>{item.item.name}</Text>
    </TouchableOpacity>
  );
};

const DeviceModal: FC<DeviceModalProps> = props => {
  const {devices, visible, connectToPeripheral, closeModal} = props;

  const renderDeviceModalListItem = useCallback(
    (item: ListRenderItemInfo<Device>) => {
      return (
        <DeviceModalListItem
          item={item}
          connectToPeripheral={connectToPeripheral}
          closeModal={closeModal}
        />
      );
    },
    [closeModal, connectToPeripheral],
  );

  return (
    <Modal
      style={modalStyle.modalContainer}
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={closeModal}>
      <SafeAreaProvider style={modalStyle.modalTitle}>
        <View style={modalStyle.modalHeader}>
          <Text style={modalStyle.modalTitleText}>
            Tap on a device to connect
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Fechar modal"
            onPress={closeModal}
            style={modalStyle.closeButton}>
            <MaterialCommunityIcons name="close" size={28} color="#1a1a1a" />
          </TouchableOpacity>
        </View>
        <FlatList
          contentContainerStyle={modalStyle.modalFlatlistContiner}
          data={devices}
          renderItem={renderDeviceModalListItem}
        />
      </SafeAreaProvider>
    </Modal>
  );
};

const modalStyle = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#f2f2f2',
  },
  modalFlatlistContiner: {
    flex: 1,
    justifyContent: 'center',
  },
  modalCellOutline: {
    borderWidth: 1,
    borderColor: 'black',
    alignItems: 'center',
    marginHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 8,
  },
  modalTitle: {
    flex: 1,
    backgroundColor: '#f2f2f2',
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 40,
    minHeight: 44,
    position: 'relative',
  },
  modalTitleText: {
    fontSize: 30,
    fontWeight: 'bold',
    paddingHorizontal: 44,
    textAlign: 'center',
  },
  closeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 44,
  },
  ctaButton: {
    backgroundColor: 'purple',
    justifyContent: 'center',
    alignItems: 'center',
    height: 50,
    marginHorizontal: 20,
    marginBottom: 5,
    borderRadius: 8,
  },
  ctaButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
});

export default DeviceModal;
