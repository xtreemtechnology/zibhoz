import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";

const TAB_ICONS = {
  markets: { active: "trending-up", inactive: "trending-up-outline" },
  chat: { active: "chatbubble", inactive: "chatbubble-outline" },
  portfolio: { active: "briefcase", inactive: "briefcase-outline" },
};

export default function TabBar({ tabs, activeTab, onTabChange }) {
  return (
    <View style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab;
        const icons = TAB_ICONS[tab] ?? { active: "ellipse", inactive: "ellipse-outline" };
        return (
          <Pressable
            key={tab}
            onPress={() => onTabChange(tab)}
            style={[styles.tabButton, isActive && styles.activeTabButton]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Ionicons
              name={isActive ? icons.active : icons.inactive}
              size={18}
              color={isActive ? colors.textOnYellow : colors.textMuted}
            />
            <Text style={[styles.tab, isActive && styles.activeTab]}>
              {tab.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 4,
    padding: 5,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 16,
    gap: 3,
  },
  activeTabButton: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  tab: {
    color: colors.textMuted,
    fontWeight: "800",
    letterSpacing: 0.8,
    fontSize: 10,
  },
  activeTab: {
    color: colors.textOnYellow,
  },
});

