import React, { useEffect, useRef } from "react";
import { Pressable, View, StyleSheet, Animated } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import colors from "../theme/colors";

// voiceState: "idle" | "listening" | "processing" | "speaking"
export default function MicButton({ onPress, voiceState = "idle" }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const outerPulse = useRef(new Animated.Value(1)).current;
  const ring2Pulse = useRef(new Animated.Value(1)).current;

  const isListening = voiceState === "listening";
  const isProcessing = voiceState === "processing";
  const isSpeaking = voiceState === "speaking";
  const isActive = isListening || isSpeaking;

  useEffect(() => {
    let anim1, anim2, anim3;
    if (isListening) {
      anim1 = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.1, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      anim2 = Animated.loop(
        Animated.sequence([
          Animated.timing(outerPulse, { toValue: 1.4, duration: 1000, useNativeDriver: true }),
          Animated.timing(outerPulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      anim3 = Animated.loop(
        Animated.sequence([
          Animated.timing(ring2Pulse, { toValue: 1.65, duration: 1400, useNativeDriver: true }),
          Animated.timing(ring2Pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
        ])
      );
      anim1.start(); anim2.start(); anim3.start();
      return () => {
        anim1.stop(); anim2.stop(); anim3.stop();
        pulse.setValue(1); outerPulse.setValue(1); ring2Pulse.setValue(1);
      };
    } else if (isSpeaking) {
      anim1 = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.07, duration: 400, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.95, duration: 400, useNativeDriver: true }),
        ])
      );
      anim2 = Animated.loop(
        Animated.sequence([
          Animated.timing(outerPulse, { toValue: 1.25, duration: 700, useNativeDriver: true }),
          Animated.timing(outerPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      anim1.start(); anim2.start();
      return () => {
        anim1.stop(); anim2.stop();
        pulse.setValue(1); outerPulse.setValue(1);
      };
    } else {
      pulse.setValue(1); outerPulse.setValue(1); ring2Pulse.setValue(1);
    }
  }, [voiceState, pulse, outerPulse, ring2Pulse, isListening, isSpeaking]);

  const stateLabel = {
    idle: "Tap to speak",
    listening: "Listening...",
    processing: "Thinking...",
    speaking: "Speaking...",
  }[voiceState];

  const orbColor = isActive ? colors.primary : colors.surfaceElevated;
  const orbBorder = isActive ? colors.primaryBorder : colors.borderStrong;
  const iconColor = isActive ? colors.textOnYellow : colors.textPrimary;

  return (
    <View style={styles.wrapper}>
      {/* Outer glow rings — only when active */}
      {isListening && (
        <Animated.View style={[styles.ring3, { transform: [{ scale: ring2Pulse }] }]} />
      )}
      {isActive && (
        <Animated.View style={[styles.ring2, { transform: [{ scale: outerPulse }] }]} />
      )}

      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={
          voiceState === "idle"
            ? "Activate microphone to speak"
            : `Voice state: ${voiceState}`
        }
        accessibilityHint="Double tap to start or stop voice input"
      >
        <Animated.View
          style={[
            styles.orb,
            { backgroundColor: orbColor, borderColor: orbBorder, transform: [{ scale: pulse }] },
            isActive && styles.activeOrb,
            isProcessing && styles.processingOrb,
          ]}
        >
          <Ionicons
            name={isProcessing ? "sync" : isSpeaking ? "volume-high" : "mic"}
            size={32}
            color={iconColor}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </Animated.View>
      </Pressable>

      <View style={styles.labelRow}>
        <View style={[styles.labelDot, { backgroundColor: isActive ? colors.primary : colors.textMuted }]} />
        <Text style={[styles.label, isActive && styles.labelActive]}>
          {stateLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    gap: 16,
  },
  ring3: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: "rgba(255,235,59,0.12)",
    backgroundColor: "rgba(255,235,59,0.04)",
    top: -30,
  },
  ring2: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryGlow,
    top: -10,
  },
  orb: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  activeOrb: {
    shadowColor: colors.primary,
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  processingOrb: {
    borderStyle: "dashed",
    opacity: 0.85,
  },
  icon: {
    fontSize: 32,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  labelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  labelActive: {
    color: colors.primary,
  },
});

