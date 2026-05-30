import { Tabs } from "expo-router";
import React from "react";

import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/theme";
import { BLEProvider } from "@/contexts/BLEContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { StyleSheet } from "react-native";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "dark"];

  return (
    <BLEProvider>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.tint,
          tabBarInactiveTintColor: theme.tabIconDefault,
          tabBarStyle: styles.tabBar,
          headerShown: false,
          tabBarButton: HapticTab,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Home",
            tabBarIcon: ({ color }) => (
              <IconSymbol size={20} name="house.fill" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="histogram"
          options={{
            title: "Histograma",
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons
                size={20}
                name="chart-histogram"
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="monitor"
          options={{
            title: "Monitorar",
            tabBarIcon: ({ color }) => (
              <MaterialCommunityIcons
                size={20}
                name="monitor"
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </BLEProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    margin: 20,
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    height: 60,
    paddingTop: 4,
    paddingBottom: 
    4,
    backgroundColor: '#020202',
    borderTopWidth: 0,
    borderRadius: 42,
    elevation: 0,
    shadowOpacity: 0,
  },
});
