import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import colors from "../theme/colors";

export default function ChatBubble({ role, text }) {
  const isUser = role === "user";
  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      {/* Avatar */}
      {!isUser && (
        <View style={styles.aiAvatar}>
          <Text style={styles.aiAvatarIcon}>Z</Text>
        </View>
      )}

      <View style={[styles.bubble, isUser ? styles.user : styles.ai]}>
        <Text style={[styles.role, isUser && styles.roleUser]}>{isUser ? "YOU" : "ZIBHOZ AI"}</Text>
        <Text style={styles.text}>{text}</Text>
      </View>

      {isUser && (
        <View style={styles.userAvatar}>
          <Ionicons name="person" size={16} color={colors.textMuted} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    alignSelf: "flex-start",
    maxWidth: "90%",
  },
  rowUser: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primaryDim,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  aiAvatarIcon: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "900",
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubble: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    gap: 5,
    flex: 1,
  },
  user: {
    backgroundColor: colors.primaryDim,
    borderColor: colors.primaryBorder,
    borderBottomRightRadius: 4,
  },
  ai: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  role: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  roleUser: {
    color: colors.primary,
  },
  text: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "500",
  },
});

