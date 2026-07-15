import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { T } from '../../constants/theme';
import { WrappedPopup } from '../../components/WrappedPopup';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TABS: { name: string; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index',     label: 'Predicciones', icon: 'football-outline',     iconActive: 'football' },
  { name: 'resultados',label: 'Resultados', icon: 'stats-chart-outline',  iconActive: 'stats-chart' },
  { name: 'grupos',    label: 'Grupos',     icon: 'people-outline',       iconActive: 'people' },
  { name: 'ranking',   label: 'Ranking',    icon: 'trophy-outline',       iconActive: 'trophy' },
  { name: 'perfil',    label: 'Perfil',     icon: 'person-outline',       iconActive: 'person' },
];

export default function TabsLayout() {
  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: T.color.surface,
          borderTopColor: T.color.line,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: T.color.accent,
        tabBarInactiveTintColor: T.color.ink3,
        tabBarLabelStyle: { fontSize: 10, fontFamily: 'HankenGrotesk_500Medium', marginBottom: 2 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? tab.iconActive : tab.icon} size={22} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
    <WrappedPopup />
    </>
  );
}
