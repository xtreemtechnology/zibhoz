import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  SafeAreaView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import colors from "../theme/colors";

export default function WaitlistScreen({ onJoined }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function handleJoin() {
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Please enter your name.");
      return;
    }
    // RFC 5322-inspired pattern: local@domain.tld, no consecutive dots
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setError("");
    setSubmitted(true);
  }

  const handleNameChange = useCallback((t) => {
    setName(t);
    setError("");
  }, []);

  const handleEmailChange = useCallback((t) => {
    setEmail(t);
    setError("");
  }, []);

  if (submitted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
        <View style={styles.center}>
          <View style={styles.orbWrap}>
            <View style={styles.orbRing3} />
            <View style={styles.orbRing2} />
            <View style={styles.orbOuter}>
              <View style={styles.orbInner}>
                <Text style={styles.orbIcon}>✅</Text>
              </View>
            </View>
          </View>

          <View style={styles.successBlock}>
            <Text style={styles.kicker}>YOU'RE IN</Text>
            <Text style={styles.successTitle}>You're on the list!</Text>
            <Text style={styles.successSub}>
              We'll notify you at{" "}
              <Text style={styles.emailHighlight}>{email.trim()}</Text> when
              Zibhoz launches. Stay tuned.
            </Text>
          </View>

          <View style={styles.successCard}>
            <Text style={styles.successCardText}>
              🎙 Voice-first prediction markets are coming.{"\n"}Be ready to
              trade with your voice.
            </Text>
          </View>

          {onJoined && (
            <Pressable style={styles.button} onPress={onJoined}>
              <Text style={styles.buttonText}>Explore the App  →</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Orb */}
          <View style={styles.orbWrap}>
            <View style={styles.orbRing3} />
            <View style={styles.orbRing2} />
            <View style={styles.orbOuter}>
              <View style={styles.orbInner}>
                <Text style={styles.orbIcon}>🎙</Text>
              </View>
            </View>
          </View>

          {/* Brand */}
          <View style={styles.brandBlock}>
            <Text style={styles.kicker}>COMING SOON</Text>
            <Text style={styles.logo}>ZIBHOZ</Text>
            <Text style={styles.tagline}>
              Be first in line.{"\n"}Voice-first prediction markets.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Alex Johnson"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={handleNameChange}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleJoin}
              />
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable style={styles.button} onPress={handleJoin}>
              <Text style={styles.buttonText}>Join the Waitlist  →</Text>
            </Pressable>
          </View>

          {/* Trust row */}
          <View style={styles.trustRow}>
            {[
              { icon: "🔒", text: "No spam" },
              { icon: "🛡", text: "Private" },
              { icon: "🚀", text: "Early access" },
            ].map((item) => (
              <View key={item.text} style={styles.trustItem}>
                <Text style={styles.trustIcon}>{item.icon}</Text>
                <Text style={styles.trustText}>{item.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: colors.background,
  },
  glowTop: {
    position: "absolute",
    top: -80,
    alignSelf: "center",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(255,235,59,0.09)",
  },
  glowBottom: {
    position: "absolute",
    bottom: -60,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  keyboardView: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 24,
  },

  // Shared center for success state
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 24,
  },

  // Orb
  orbWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 140,
    height: 140,
  },
  orbRing3: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: "rgba(255,235,59,0.10)",
  },
  orbRing2: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: "rgba(255,235,59,0.06)",
  },
  orbOuter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryDim,
    alignItems: "center",
    justifyContent: "center",
  },
  orbInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.65,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  orbIcon: {
    fontSize: 26,
  },

  // Brand
  brandBlock: {
    alignItems: "center",
    gap: 6,
  },
  kicker: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2,
    textAlign: "center",
  },
  logo: {
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: 5,
    color: colors.textPrimary,
    textAlign: "center",
  },
  tagline: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: "600",
    lineHeight: 26,
    textAlign: "center",
  },

  // Form
  form: {
    width: "100%",
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "500",
  },
  errorText: {
    color: colors.negative,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 17,
    paddingHorizontal: 52,
    borderRadius: 999,
    alignItems: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    width: "100%",
    marginTop: 4,
  },
  buttonText: {
    color: colors.textOnYellow,
    fontWeight: "900",
    fontSize: 17,
    letterSpacing: 0.6,
  },

  // Trust row
  trustRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    width: "100%",
  },
  trustItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    gap: 4,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  trustIcon: {
    fontSize: 16,
  },
  trustText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // Success state
  successBlock: {
    alignItems: "center",
    gap: 8,
  },
  successTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.textPrimary,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  successSub: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
    maxWidth: 300,
    fontWeight: "500",
  },
  emailHighlight: {
    color: colors.primary,
    fontWeight: "700",
  },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    width: "100%",
  },
  successCardText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 22,
    textAlign: "center",
    fontWeight: "500",
  },
});
