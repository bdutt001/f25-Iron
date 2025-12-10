import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";

import { useUser } from "../context/UserContext";
import { API_BASE_URL, fetchTagCatalog, updateUserProfile } from "@/utils/api";
import { ThemeMode, useAppTheme } from "../context/ThemeContext";
import OverflowMenu, { type OverflowAction } from "../components/ui/OverflowMenu";
import { AppNotice } from "../components/ui/AppNotice";

const MAX_INTEREST_TAGS = 10;

const sortTags = (tags: string[]): string[] => [...tags].sort((a, b) => a.localeCompare(b));
const normalizeQuery = (value: string): string => value.trim().toLowerCase();

const computeFuzzyScore = (normalizedQuery: string, candidate: string): number | null => {
  const normalizedCandidate = candidate.toLowerCase();
  if (!normalizedQuery) return null;

  const directMatchIndex = normalizedCandidate.indexOf(normalizedQuery);
  if (directMatchIndex !== -1) {
    const penalty = directMatchIndex * 5 + (normalizedCandidate.length - normalizedQuery.length);
    return 200 - penalty;
  }

  let score = 0;
  let searchIndex = 0;

  for (const char of normalizedQuery) {
    const foundIndex = normalizedCandidate.indexOf(char, searchIndex);
    if (foundIndex === -1) return null;

    if (foundIndex === searchIndex) score += 5;
    else if (foundIndex - searchIndex === 1) score += 3;
    else score += Math.max(1, 3 - (foundIndex - searchIndex));

    searchIndex = foundIndex + 1;
  }

  return score - (normalizedCandidate.length - normalizedQuery.length);
};

const fuzzyFilter = (items: string[], query: string): string[] => {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return items;

  return items
    .map((item) => {
      const score = computeFuzzyScore(normalizedQuery, item);
      return score === null ? null : { item, score };
    })
    .filter((entry): entry is { item: string; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score || a.item.localeCompare(b.item))
    .map((entry) => entry.item);
};

export default function OnboardingScreen() {
  const router = useRouter();
  const { currentUser, setCurrentUser, accessToken, setPrefetchedUsers, fetchWithAuth } = useUser();
  const { colors, isDark, mode: themeMode, setMode: setThemeMode } = useAppTheme();

  const [nameInput, setNameInput] = useState(currentUser?.name?.trim() ?? "");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(currentUser?.interestTags ?? []);
  const [loadingTags, setLoadingTags] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [hasTouchedName, setHasTouchedName] = useState(false);
  const lastUserIdRef = useRef<number | null>(currentUser?.id ?? null);
  const [showThemeOptions, setShowThemeOptions] = useState(false);

  const [profilePicture, setProfilePicture] = useState<string | null>(
    currentUser?.profilePicture
      ? currentUser.profilePicture.startsWith("http")
        ? currentUser.profilePicture
        : `${API_BASE_URL}${currentUser.profilePicture}`
      : null
  );
  const [photoMenuVisible, setPhotoMenuVisible] = useState(false);
  const [photoSuccessVisible, setPhotoSuccessVisible] = useState(false);
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);
  const [removeSuccessVisible, setRemoveSuccessVisible] = useState(false);

  useEffect(() => {
    if (!currentUser || !accessToken) {
      router.replace("/login");
    }
  }, [accessToken, currentUser, router]);

  useEffect(() => {
    if (!currentUser) return;

    if (lastUserIdRef.current !== currentUser.id) {
      lastUserIdRef.current = currentUser.id;
      setHasTouchedName(false);
      setNameInput(currentUser.name?.trim() ?? "");
      setSelectedTags(currentUser.interestTags ?? []);
      return;
    }

    setSelectedTags(currentUser.interestTags ?? []);
    if (!hasTouchedName && typeof currentUser.name === "string") {
      setNameInput(currentUser.name.trim());
    }
  }, [currentUser, hasTouchedName]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) return;

    const loadTags = async () => {
      setLoadingTags(true);
      setTagError(null);

      try {
        const tags = await fetchTagCatalog(fetchWithAuth);
        if (!cancelled) setAvailableTags(tags);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Unable to load tags";
          setTagError(message);
        }
      } finally {
        if (!cancelled) setLoadingTags(false);
      }
    };

    void loadTags();
    return () => {
      cancelled = true;
    };
  }, [accessToken, fetchWithAuth]);

  const tagOptions = useMemo(() => {
    if (availableTags.length) return availableTags;
    return sortTags(Array.from(new Set([...selectedTags])));
  }, [availableTags, selectedTags]);

  const searchTerm = tagSearch.trim();
  const filteredTagOptions = useMemo(() => fuzzyFilter(tagOptions, searchTerm), [tagOptions, searchTerm]);

  const limitReached = selectedTags.length >= MAX_INTEREST_TAGS;

  const handleToggleTag = (tag: string) => {
    setTagError(null);

    const isRemoving = selectedTags.includes(tag);
    if (!isRemoving && limitReached) {
      setTagError(`You can select up to ${MAX_INTEREST_TAGS} interest tags.`);
      return;
    }

    const next = isRemoving ? selectedTags.filter((t) => t !== tag) : [...selectedTags, tag];
    setSelectedTags(sortTags(next));
  };

  const applyUserUpdate = useCallback(
    (updated: any) => {
      if (!currentUser) {
        setCurrentUser(updated);
        return;
      }

      setCurrentUser({
        ...currentUser,
        ...updated,
        interestTags: updated?.interestTags ?? currentUser.interestTags,
        profilePicture: updated?.profilePicture ?? currentUser.profilePicture,
        visibility:
          typeof updated?.visibility === "boolean" ? updated.visibility : currentUser.visibility,
      });
    },
    [currentUser, setCurrentUser]
  );

  const uploadImage = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission required", "You must grant photo access to upload a profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      const mimeType = asset.mimeType || "image/jpeg";

      if (!currentUser || !accessToken) {
        Alert.alert("Error", "You must be logged in to upload a profile picture.");
        return;
      }

      const uploadUrl = `${API_BASE_URL}/api/users/${currentUser.id}/profile-picture`;
      const form = new FormData();
      form.append("image", { uri, name: "profile.jpg", type: mimeType } as any);

      setIsUploading(true);
      const res = await fetchWithAuth(uploadUrl, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        throw new Error(`Upload failed (${res.status})`);
      }

      const data = (await res.json()) as { profilePicture?: string };
      if (data.profilePicture) {
        const newUrl = data.profilePicture.startsWith("http")
          ? `${data.profilePicture}?t=${Date.now()}`
          : `${API_BASE_URL}${data.profilePicture}?t=${Date.now()}`;

        setProfilePicture(newUrl);
        applyUserUpdate({ profilePicture: newUrl });
      }

      setPhotoSuccessVisible(true);
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert("Upload failed", "Please try again later.");
    } finally {
      setIsUploading(false);
    }
  }, [accessToken, applyUserUpdate, currentUser, fetchWithAuth]);

  const handleContinue = async () => {
    if (!currentUser || !accessToken) return;

    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setNameError("Name is required.");
      return;
    }

    setSaving(true);
    setNameError(null);
    setTagError(null);

    try {
      const updated = await updateUserProfile(
        currentUser.id,
        { name: trimmedName, interestTags: selectedTags },
        fetchWithAuth
      );

      applyUserUpdate(updated);
      setPrefetchedUsers(null);
      router.replace("/(tabs)/profile");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save profile";
      Alert.alert("Onboarding", message);
    } finally {
      setSaving(false);
    }
  };

  const displayedSelectedTags = useMemo(() => sortTags(selectedTags), [selectedTags]);

  const mutedText = { color: colors.muted };
  const primaryText = { color: colors.text };
  const cardSurface = {
    backgroundColor: colors.card,
    borderColor: colors.border,
    shadowColor: isDark ? "#000" : "#000",
  };
  const inputSurface = {
    backgroundColor: isDark ? colors.background : "#fff",
    borderColor: colors.border,
    color: colors.text,
  };

  const takePhoto = useCallback(async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          "Permission required",
          "Camera access is needed to take a profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const uri = asset.uri;
      const mimeType = asset.mimeType || "image/jpeg";

      if (!currentUser || !accessToken) {
        Alert.alert("Error", "You must be logged in to upload a profile picture.");
        return;
      }

      const uploadUrl = `${API_BASE_URL}/api/users/${currentUser.id}/profile-picture`;
      const form = new FormData();
      form.append("image", { uri, name: "profile.jpg", type: mimeType } as any);

      setIsUploading(true);
      const res = await fetchWithAuth(uploadUrl, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        throw new Error(`Upload failed (${res.status})`);
      }

      const data = (await res.json()) as { profilePicture?: string };
      if (data.profilePicture) {
        const newUrl = data.profilePicture.startsWith("http")
          ? `${data.profilePicture}?t=${Date.now()}`
          : `${API_BASE_URL}${data.profilePicture}?t=${Date.now()}`;

        setProfilePicture(newUrl);
        applyUserUpdate({ profilePicture: newUrl });
      }

      setPhotoSuccessVisible(true);
    } catch (error) {
      console.error("Error capturing photo:", error);
      Alert.alert("Unable to open camera", "Please try again.", undefined);
    } finally {
      setIsUploading(false);
    }
  }, [accessToken, applyUserUpdate, currentUser, fetchWithAuth]);

  const removeProfilePicture = useCallback(async () => {
    if (!currentUser) return;
    try {
      const updated = await updateUserProfile(
        currentUser.id,
        { profilePicture: null },
        fetchWithAuth
      );
      applyUserUpdate(updated);
      setProfilePicture(null);
      setRemoveConfirmVisible(false);
      setRemoveSuccessVisible(true);
    } catch (error) {
      console.error("Error removing profile picture:", error);
      Alert.alert("Unable to remove picture", "Please try again later.");
    }
  }, [applyUserUpdate, currentUser, fetchWithAuth]);

  const confirmRemoveProfilePicture = useCallback(() => {
    if (!profilePicture) return;
    setRemoveConfirmVisible(true);
  }, [profilePicture]);

  const profilePictureActions = useMemo<OverflowAction[]>(() => {
    const actions: OverflowAction[] = [
      { key: "camera", label: "Take Photo", icon: "camera-outline", onPress: () => void takePhoto() },
      {
        key: "library",
        label: "Choose From Library",
        icon: "images-outline",
        onPress: () => void uploadImage(),
      },
    ];

    if (profilePicture) {
      actions.push({
        key: "remove",
        label: "Remove Photo",
        icon: "trash-outline",
        destructive: true,
        onPress: confirmRemoveProfilePicture,
      });
    }

    return actions;
  }, [confirmRemoveProfilePicture, profilePicture, takePhoto, uploadImage]);

  const themeOptions: { key: ThemeMode; label: string }[] = [
    { key: "system", label: "System" },
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
    >
      <View style={styles.hero}>
        <Text style={[styles.title, primaryText]}>Welcome to MingleMap</Text>
        <Text style={[styles.subtitle, mutedText]}>
          Finish your profile so people nearby can recognize you.
        </Text>
      </View>

      <View style={[styles.section, cardSurface]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, primaryText]}>Profile Picture</Text>
        </View>

        <View style={styles.pictureWrapper}>
          {profilePicture ? (
            <Image
              source={{ uri: profilePicture }}
              style={[styles.profilePicture, { borderColor: colors.border }]}
            />
          ) : (
            <View
              style={[
                styles.profilePicture,
                styles.picturePlaceholder,
                { borderColor: colors.border },
              ]}
            >
              <Text style={[styles.placeholderText, primaryText]}>No Picture</Text>
            </View>
          )}
          <TouchableOpacity
            style={[
              styles.profileUploadFab,
              { backgroundColor: colors.accent },
              (isUploading || saving) && styles.disabledAction,
            ]}
            onPress={() => setPhotoMenuVisible(true)}
            disabled={isUploading || saving}
            accessibilityRole="button"
            accessibilityLabel="Profile picture options"
          >
            {isUploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="camera" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

        <View style={[styles.section, cardSurface]}>
        <TouchableOpacity
          style={[styles.sectionHeader, styles.appearanceHeader]}
          onPress={() => setShowThemeOptions((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Toggle appearance options"
          activeOpacity={0.85}
        >
          <Text style={[styles.sectionTitle, primaryText]}>Appearance</Text>
          <Ionicons name={isDark ? "moon" : "sunny"} size={22} color={colors.accent} />
        </TouchableOpacity>
        {showThemeOptions && (
          <>
            <Text style={[styles.helperText, mutedText]}>
              Choose Light or Dark, or follow your device setting.
            </Text>
            <View style={styles.themeRow}>
              {themeOptions.map((opt) => {
                const active = themeMode === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[
                      styles.themeChip,
                      active && styles.themeChipActive,
                      { borderColor: colors.border, backgroundColor: isDark ? colors.background : "#fff" },
                      active && { backgroundColor: isDark ? "#0f172a" : "#e6f0ff" },
                    ]}
                    onPress={() => setThemeMode(opt.key)}
                    accessibilityRole="button"
                  >
                    <Text
                      style={[
                        styles.themeChipText,
                        active && styles.themeChipTextActive,
                        { color: active ? colors.accent : colors.text },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </View>

      <View style={[styles.section, cardSurface]}>
        <Text style={[styles.sectionTitle, primaryText]}>Display Name</Text>
        <Text style={[styles.helperText, mutedText]}>
          This is how you appear to others. Keep it recognizable.
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              color: colors.text,
              borderColor: colors.border,
              backgroundColor: inputSurface.backgroundColor,
            },
          ]}
          placeholder="Enter your name"
          placeholderTextColor={colors.muted}
          value={nameInput}
          onChangeText={(value) => {
            setNameError(null);
            setHasTouchedName(true);
            setNameInput(value);
          }}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="done"
        />
        {nameError && <Text style={[styles.errorText, { color: "#c00" }]}>{nameError}</Text>}
      </View>

      <View style={[styles.section, cardSurface]}>
        <View style={styles.tagHeader}>
          <View>
            <Text style={[styles.sectionTitle, primaryText]}>Interest Tags</Text>
            <Text style={[styles.helperText, mutedText]}>Pick what describes you best.</Text>
          </View>
          <Text style={[styles.tagCount, { color: colors.accent }]}>
            {`${selectedTags.length}/${MAX_INTEREST_TAGS}`}
          </Text>
        </View>

        <View
          style={[
            styles.tagSearchWrapper,
            { backgroundColor: inputSurface.backgroundColor, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search" size={16} color={colors.muted} style={{ marginRight: 6 }} />
          <TextInput
            value={tagSearch}
            onChangeText={setTagSearch}
            placeholder="Search tags"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.tagSearchInput, { color: colors.text }]}
            placeholderTextColor={colors.muted}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity
              onPress={() => setTagSearch("")}
              style={styles.tagSearchClear}
              accessibilityRole="button"
            >
              <Text style={[styles.tagSearchClearText, { color: colors.accent }]}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {loadingTags ? (
          <View style={styles.catalogLoading}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.catalogLoadingText, mutedText]}>Loading tag catalog.</Text>
          </View>
        ) : (
          <View style={styles.catalogGrid}>
            {filteredTagOptions.map((tag) => {
              const selected = selectedTags.includes(tag);
              const disabled = saving || (!selected && limitReached);

              return (
                <TouchableOpacity
                  key={tag}
                  style={[
                    styles.tagOption,
                    { borderColor: colors.border, backgroundColor: inputSurface.backgroundColor },
                    selected && [
                      styles.tagOptionSelected,
                      { borderColor: colors.accent, backgroundColor: isDark ? "#0f172a" : "#e6f0ff" },
                    ],
                    disabled && styles.tagOptionDisabled,
                  ]}
                  disabled={saving}
                  onPress={() => handleToggleTag(tag)}
                >
                  <Text
                    style={[
                      styles.tagOptionText,
                      { color: colors.text },
                      selected && [styles.tagOptionTextSelected, { color: colors.accent }],
                    ]}
                  >
                    {tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {tagError && <Text style={[styles.errorText, { color: "#c00" }]}>{tagError}</Text>}

        {displayedSelectedTags.length > 0 && (
          <View style={styles.selectedTagsWrapper}>
            {displayedSelectedTags.map((tag) => (
              <View
                key={tag}
                style={[
                  styles.selectedChip,
                  { backgroundColor: isDark ? colors.background : "#e6f0ff", borderColor: colors.border },
                ]}
              >
                <Text style={[styles.selectedChipText, { color: colors.accent }]}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: colors.accent },
            (saving || isUploading) && styles.disabledAction,
          ]}
          onPress={handleContinue}
          disabled={saving || isUploading}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" style={{ marginLeft: 8 }} />
            </>
          )}
        </TouchableOpacity>
      </View>
      <OverflowMenu
        visible={photoMenuVisible}
        onClose={() => setPhotoMenuVisible(false)}
        title="Profile picture"
        actions={profilePictureActions}
      />
      <AppNotice
        visible={photoSuccessVisible}
        onClose={() => setPhotoSuccessVisible(false)}
        title="Success"
        message="Profile picture updated!"
      />
      <OverflowMenu
        visible={removeConfirmVisible}
        onClose={() => setRemoveConfirmVisible(false)}
        title="Remove profile picture?"
        message="This will revert to your initials across the app."
        actions={[
          {
            key: "remove-photo",
            label: isUploading ? "Removing..." : "Remove photo",
            icon: "trash-outline",
            destructive: true,
            disabled: isUploading,
            onPress: () => void removeProfilePicture(),
          },
        ]}
      />
      <AppNotice
        visible={removeSuccessVisible}
        onClose={() => setRemoveSuccessVisible(false)}
        title="Removed"
        message="Profile picture removed."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    color: "#666",
    marginBottom: 24,
  },
  hero: {
    alignItems: "center",
    marginBottom: 20,
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  appearanceHeader: { paddingVertical: 4 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  pictureWrapper: {
    marginTop: 16,
    alignItems: "center",
  },
  profilePicture: {
    width: 140,
    height: 140,
    borderRadius: 70,
    marginBottom: 12,
    backgroundColor: "#ddd",
    borderWidth: StyleSheet.hairlineWidth,
  },
  picturePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#555",
    fontWeight: "600",
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  uploadButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  profileUploadFab: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#333",
    backgroundColor: "#fff",
  },
  helperText: {
    marginTop: 6,
    fontSize: 13,
    color: "#666",
  },
  errorText: {
    marginTop: 8,
    color: "#c00",
    fontSize: 13,
  },
  tagHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  tagCount: {
    fontSize: 13,
    color: "#66a8ff",
  },
  tagSearchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    backgroundColor: "#fff",
  },
  tagSearchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 14,
    color: "#333",
  },
  tagSearchClear: {
    marginLeft: 8,
  },
  tagSearchClearText: {
    color: "#007BFF",
    fontSize: 13,
    fontWeight: "600",
  },
  catalogLoading: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
  },
  catalogLoadingText: {
    marginLeft: 8,
    color: "#666",
  },
  catalogGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
  },
  tagOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
    marginRight: 8,
    marginBottom: 8,
  },
  tagOptionSelected: {
    borderColor: "#007BFF",
    backgroundColor: "#e6f0ff",
  },
  tagOptionDisabled: {
    opacity: 0.6,
  },
  tagOptionText: {
    fontSize: 14,
    color: "#333",
  },
  tagOptionTextSelected: {
    color: "#66a8ff",
    fontWeight: "600",
  },
  selectedTagsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
  },
  selectedChip: {
    backgroundColor: "#e6f0ff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  selectedChipText: {
    color: "#66a8ff",
    fontSize: 14,
    fontWeight: "500",
  },
  actions: {
    marginBottom: 24,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  disabledAction: {
    opacity: 0.6,
  },
  themeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  themeChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  themeChipActive: { borderColor: "#2563eb", backgroundColor: "#e6f0ff" },
  themeChipText: { fontWeight: "700", color: "#111827" },
  themeChipTextActive: { color: "#66a8ff" },
});
