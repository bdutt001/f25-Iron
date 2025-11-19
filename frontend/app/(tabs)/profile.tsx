import { useFocusEffect } from "@react-navigation/native";
import React, { useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  Alert,
  Image,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { AlertOptions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useUser, type CurrentUser } from "../../context/UserContext";
import { fetchTagCatalog, updateUserProfile, API_BASE_URL } from "@/utils/api";
import type { ApiUser } from "../../utils/geo";
import { ThemeMode, useAppTheme } from "../../context/ThemeContext";

const sortTags = (tags: string[]): string[] =>
  [...tags].sort((a, b) => a.localeCompare(b));

const MAX_INTEREST_TAGS = 10;

const normalizeQuery = (value: string): string => value.trim().toLowerCase();

const computeFuzzyScore = (
  normalizedQuery: string,
  candidate: string
): number | null => {
  const normalizedCandidate = candidate.toLowerCase();
  if (!normalizedQuery) return null;

  const directMatchIndex = normalizedCandidate.indexOf(normalizedQuery);
  if (directMatchIndex !== -1) {
    const penalty =
      directMatchIndex * 5 + (normalizedCandidate.length - normalizedQuery.length);
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

export default function ProfileScreen() {
  const { status, currentUser, setCurrentUser, accessToken, setPrefetchedUsers, fetchWithAuth, logout } = useUser();
  const { colors, mode: themeMode, setMode: setThemeMode, isDark } = useAppTheme();
  const alertAppearance = useMemo<AlertOptions>(
    () => ({ userInterfaceStyle: isDark ? "dark" : "light" }),
    [isDark]
  );

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<ApiUser[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);
  const [showThemeOptions, setShowThemeOptions] = useState(false);

  // ✅ Profile Picture State
  const [profilePicture, setProfilePicture] = useState<string | null>(
    currentUser?.profilePicture
      ? currentUser.profilePicture.startsWith("http")
        ? currentUser.profilePicture
        : `${API_BASE_URL}${currentUser.profilePicture}`
      : null
  );

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const applyUserUpdate = (updated: CurrentUser) => {
    if (!currentUser) {
      setCurrentUser(updated);
      return;
    }

    setCurrentUser({
      ...currentUser,
      ...updated,
      interestTags:
        updated.interestTags ?? currentUser.interestTags,
      profilePicture:
        updated.profilePicture ?? currentUser.profilePicture,
      visibility:
        typeof updated.visibility === "boolean"
          ? updated.visibility
          : currentUser.visibility,
    });
  };

  useEffect(() => {
    setSelectedTags(currentUser?.interestTags ?? []);
  }, [currentUser?.interestTags]);

  useEffect(() => {
    if (!isEditingName) {
      setNameInput(currentUser?.name ?? "");
    }
  }, [currentUser?.name, isEditingName]);

  useEffect(() => {
    if (!currentUser) {
      setIsEditingName(false);
      setNameError(null);
      setNameInput("");
    }
  }, [currentUser]);

  useEffect(() => {
    if (!expanded) setTagSearch("");
  }, [expanded]);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) return;

    const loadTags = async () => {
      setLoadingTags(true);
      setTagError(null);
      try {
        const tags = await fetchTagCatalog(fetchWithAuth);
        if (!cancelled) setAvailableTags(tags);
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error ? error.message : "Unable to load tags";
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
  }, [currentUser, fetchWithAuth]);

  // Load blocked users for this profile tab (also on focus)
  const loadBlocked = React.useCallback(async () => {
    if (!currentUser) {
      setBlockedUsers([]);
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/users/me/blocks`);
      const data = (await res.json()) as ApiUser[] | { error?: string };
      setBlockedUsers(Array.isArray(data) ? data : []);
    } catch {
      setBlockedUsers([]);
    }
  }, [currentUser, fetchWithAuth]);

  useEffect(() => {
    if (!currentUser) return;
    setBlockedLoading(true);
    loadBlocked().finally(() => setBlockedLoading(false));
  }, [currentUser, loadBlocked]);
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      (async () => { if (active) await loadBlocked(); })();
      return () => { active = false; };
    }, [loadBlocked])
  );

  const handleUnblock = async (userId: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/api/users/${userId}/block`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        setBlockedUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch {
      // ignore
    }
  };

  const onRefreshBlocked = async () => {
    setBlockedLoading(true);
    try { await loadBlocked(); } finally { setBlockedLoading(false); }
  };

  const handleNameInputChange = (value: string) => {
    if (nameError) setNameError(null);
    setNameInput(value);
  };

  const startNameEdit = () => {
    if (!currentUser) return;
    setNameError(null);
    setNameInput(currentUser.name ?? "");
    setIsEditingName(true);
  };

  const handleCancelNameEdit = () => {
    setIsEditingName(false);
    setNameError(null);
    setNameInput(currentUser?.name ?? "");
  };

  const handleSaveName = async () => {
    if (!currentUser) return;

    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameError("Name cannot be empty.");
      return;
    }

    if (trimmed === (currentUser.name ?? "").trim()) {
      setIsEditingName(false);
      return;
    }

    setSavingName(true);
    setNameError(null);

    try {
      const updated = await updateUserProfile(currentUser.id, { name: trimmed }, fetchWithAuth);
      applyUserUpdate(updated);
      setNameInput(updated.name ?? trimmed);
      setIsEditingName(false);
      Alert.alert("Success", "Name updated!", undefined, alertAppearance);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update name";
      setNameError(message);
    } finally {
      setSavingName(false);
    }
  };

  const handleLogout = () => {
    setPrefetchedUsers(null);
    void logout();
  };

  // ✅ Stable version for Android + iOS
  const uploadImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Permission required", "You must grant photo access to upload a profile picture.", undefined, alertAppearance);
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
      console.log("📸 Selected image URI:", uri);

      if (!currentUser || !accessToken) {
        Alert.alert("Error", "You must be logged in to upload a profile picture.", undefined, alertAppearance);
        return;
      }

      const uploadUrl = `${API_BASE_URL}/api/users/${currentUser.id}/profile-picture`;
      console.log("🌐 Uploading to:", uploadUrl);

      const res = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        uploadType: FileSystem.FileSystemUploadType.MULTIPART, // legacy enum again
        fieldName: "image", // field expected by our backend (matches multer)
        mimeType,
    });

      console.log("📤 Upload response:", res.status, res.body);

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Upload failed (${res.status})`);
    }
      
      const data = JSON.parse(res.body || "{}");
      if (data.profilePicture) {
        // ✅ Use the full Cloudinary URL directly, with a cache-buster
        const newUrl = data.profilePicture.startsWith("http")
        ? `${data.profilePicture}?t=${Date.now()}`
        : `${API_BASE_URL}${data.profilePicture}?t=${Date.now()}`;

        // Update local and global state so the UI refreshes instantly
        setProfilePicture(newUrl);
        setCurrentUser({ ...currentUser, profilePicture: newUrl });
      }

      Alert.alert("Success", "Profile picture updated!", undefined, alertAppearance);
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert("Upload failed", "Please try again later.", undefined, alertAppearance);
    }
  };

  const handleToggleTag = async (tag: string) => {
    if (!currentUser) return;

    const previous = [...selectedTags];
    const isRemoving = previous.includes(tag);

    if (!isRemoving && previous.length >= MAX_INTEREST_TAGS) {
      setTagError(`You can select up to ${MAX_INTEREST_TAGS} interest tags.`);
      return;
    }

    const next = isRemoving
      ? previous.filter((t) => t !== tag)
      : [...previous, tag];
    const sortedNext = sortTags(next);

    setSelectedTags(sortedNext);
    setSavingTags(true);
    setTagError(null);

    try {
      const updated = await updateUserProfile(currentUser.id, { interestTags: sortedNext }, fetchWithAuth);
      applyUserUpdate(updated);
      setSelectedTags(updated.interestTags ?? []);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update tags";
      setTagError(message);
      setSelectedTags(previous);
    } finally {
      setSavingTags(false);
    }
  };

  const displayedSelectedTags = useMemo(
    () => sortTags(selectedTags),
    [selectedTags]
  );
  const tagOptions = useMemo(() => {
    if (availableTags.length) return availableTags;
    return sortTags(Array.from(new Set([...selectedTags])));
  }, [availableTags, selectedTags]);

  const searchTerm = tagSearch.trim();
  const filteredTagOptions = useMemo(
    () => fuzzyFilter(tagOptions, searchTerm),
    [tagOptions, searchTerm]
  );
  const hasSearch = searchTerm.length > 0;
  const noMatches = !loadingTags && hasSearch && filteredTagOptions.length === 0;
  const noCatalogTags = !loadingTags && !hasSearch && !tagOptions.length;
  const limitReached = selectedTags.length >= MAX_INTEREST_TAGS;

  const collapsedMessage =
    selectedTags.length === 0
      ? "No tags selected yet. Tap Edit to choose your interests."
      : undefined;

  const themeOptions: { key: ThemeMode; label: string }[] = [
    { key: "system", label: "System" },
    { key: "light", label: "Light" },
    { key: "dark", label: "Dark" },
  ];

  const displayName =
    currentUser?.name && currentUser.name.trim().length > 0
      ? currentUser.name
      : currentUser?.email || "Anonymous";

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

  const mutedText = { color: colors.muted };
  const primaryText = { color: colors.text };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={[styles.card, cardSurface]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => setShowThemeOptions((v) => !v)}
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons
              name={isDark ? "moon" : "sunny"}
              size={24}
              color={colors.accent}
            />
          </TouchableOpacity>
        </View>

        {showThemeOptions && (
          <>
            <Text style={[styles.themeNote, mutedText]}>
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
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
          </>
        )}


        {/* ✅ Profile Picture Section */}
        <View style={styles.profilePictureSection}>
          <View style={styles.profilePictureWrapper}>
            {profilePicture ? (
              <Image source={{ uri: profilePicture }} style={[styles.profilePicture, { borderColor: colors.border }]} />
            ) : (
              <View style={[styles.profilePicture, styles.profilePlaceholder, { borderColor: colors.border }]}>
                <Text style={primaryText}>No Picture</Text>
              </View>
            )}
            <TouchableOpacity
              onPress={uploadImage}
              style={[styles.profileUploadFab, { backgroundColor: colors.accent }]}
              accessibilityRole="button"
              accessibilityLabel="Upload profile picture"
            >
              <Ionicons name="camera" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.displayNameRow}>
            {isEditingName ? (
              <View style={styles.inlineNameEditRow}>
                <TextInput
                  value={nameInput}
                  onChangeText={handleNameInputChange}
                  placeholder="Enter your name"
                  autoCapitalize="words"
                  returnKeyType="done"
                  editable={!savingName}
                  onSubmitEditing={() => {
                    if (!savingName) void handleSaveName();
                  }}
                  style={[styles.nameInput, styles.inlineNameInput, inputSurface, { textAlign: "center" }]}
                  accessibilityLabel="Name input"
                  placeholderTextColor={colors.muted}
                />
                <TouchableOpacity
                  onPress={handleSaveName}
                  disabled={savingName}
                  style={styles.inlineNameIcon}
                  accessibilityLabel="Save name"
                >
                  <Ionicons name="checkmark" size={20} color={colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCancelNameEdit}
                  disabled={savingName}
                  style={styles.inlineNameIcon}
                  accessibilityLabel="Cancel name edit"
                >
                  <Ionicons name="close" size={20} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.inlineNameReadRow}>
                <View style={styles.inlineNameIconGhost} pointerEvents="none" />
                <Text style={[styles.displayNameText, styles.displayNameTextFull, primaryText]} numberOfLines={1}>
                  {displayName}
                </Text>
                <TouchableOpacity
                  onPress={startNameEdit}
                  accessibilityRole="button"
                  accessibilityLabel="Edit display name"
                  style={[styles.inlineNameIcon, styles.inlineNameEditButton]}
                >
                  <Ionicons name="pencil" size={18} color={colors.accent} />
                </TouchableOpacity>
              </View>
            )}
            {nameError && <Text style={[styles.errorText, styles.nameError]}>{nameError}</Text>}
          </View>
        </View>

        <Text style={[styles.label, primaryText]}>Email:</Text>
        <Text style={[styles.value, primaryText]}>{currentUser?.email || "-"}</Text>
        <Text style={[styles.label, primaryText]}>Visibility:</Text>
        <Text style={[styles.value, primaryText]}>{status}</Text>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* ✅ Interest Tags Section (unchanged) */}
        <View style={styles.tagHeader}>
          <Text style={[styles.label, primaryText]}>
            Interest Tags
            {expanded && (
              <Text style={[styles.labelCount, { color: colors.accent }]}>{` (${selectedTags.length}/${MAX_INTEREST_TAGS})`}</Text>
            )}
          </Text>
          <View style={styles.tagHeaderActions}>
            {savingTags && (
              <ActivityIndicator
                size="small"
                color="#007BFF"
                style={styles.savingIndicator}
              />
            )}
            <TouchableOpacity onPress={() => setExpanded((prev) => !prev)}>
              <Text style={styles.toggleText}>{expanded ? "Hide" : "Edit"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {collapsedMessage ? (
          <Text style={[styles.emptyTags, mutedText]}>{collapsedMessage}</Text>
        ) : (
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

        {expanded && (
          <View
            style={[
              styles.catalogSection,
              { maxHeight: undefined, backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.tagSearchWrapper,
                { backgroundColor: inputSurface.backgroundColor, borderColor: colors.border },
              ]}
            >
              <TextInput
                value={tagSearch}
                onChangeText={setTagSearch}
                placeholder="Search tags"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={[styles.tagSearchInput, { color: colors.text }]}
                accessibilityLabel="Search interest tags"
                placeholderTextColor={colors.muted}
              />
              {hasSearch && (
                <TouchableOpacity
                  onPress={() => setTagSearch("")}
                  style={styles.tagSearchClear}
                  accessibilityRole="button"
                >
                  <Text style={styles.tagSearchClearText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            {loadingTags ? (
              <View style={styles.catalogLoading}>
                <ActivityIndicator
                  size="small"
                  color="#007BFF"
                  style={styles.savingIndicator}
                />
                <Text style={[styles.helperText, styles.catalogLoadingText, mutedText]}>
                  Loading tag catalog...
                </Text>
              </View>
            ) : (
              filteredTagOptions.length > 0 && (
                <View>
                  <View style={styles.catalogGrid}>
                    {filteredTagOptions.map((tag) => {
                      const selected = selectedTags.includes(tag);
                      return (
                        <TouchableOpacity
                          key={tag}
                          style={[
                            styles.tagOption,
                            selected && styles.tagOptionSelected,
                            (savingTags || (!selected && limitReached)) &&
                            styles.tagOptionDisabled,
                            { backgroundColor: inputSurface.backgroundColor, borderColor: colors.border },
                            selected && { backgroundColor: isDark ? "#0f172a" : "#e6f0ff", borderColor: colors.accent },
                          ]}
                          onPress={() => handleToggleTag(tag)}
                          disabled={savingTags}
                        >
                          <Text
                            style={[
                              styles.tagOptionText,
                              selected && styles.tagOptionTextSelected,
                              { color: colors.text },
                              selected && { color: colors.accent },
                            ]}
                          >
                            {tag}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )
            )}
            {tagError && <Text style={[styles.errorText, { color: "#c00" }]}>{tagError}</Text>}
            {noMatches && (
              <Text style={[styles.helperText, mutedText]}>
                {`No matches found for ${searchTerm}. Try a different keyword.`}
              </Text>
            )}
            {noCatalogTags && (
              <Text style={[styles.helperText, mutedText]}>
                No tags available yet. Ask an admin to populate the catalog.
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Blocked accounts */}
      <View style={[styles.blockedSection, cardSurface]}>
        <View style={styles.blockedHeaderRow}>
          <Text style={[styles.sectionTitle, primaryText]}>Blocked Accounts</Text>
          <TouchableOpacity onPress={onRefreshBlocked} disabled={blockedLoading} accessibilityRole="button">
            <Text style={[styles.link, blockedLoading && styles.linkDisabled]}>{blockedLoading ? "Refreshing..." : "Refresh"}</Text>
          </TouchableOpacity>
        </View>
        {blockedLoading && blockedUsers.length === 0 ? (
          <ActivityIndicator size="small" color="#007BFF" />
        ) : blockedUsers.length === 0 ? (
          <Text style={[styles.helperText, mutedText]}>You haven&apos;t blocked anyone.</Text>
        ) : (
          blockedUsers.map((u) => {
            const pp = (u as any).profilePicture as string | null | undefined;
            const uri = pp ? (pp.startsWith("http") ? pp : `${API_BASE_URL}${pp}`) : null;
            const initial = (u.name || u.email || "?").charAt(0).toUpperCase();
            return (
              <View key={u.id} style={[styles.blockedRowItem, { borderBottomColor: colors.border }]}>
                {uri ? (
                  <Image source={{ uri }} style={styles.blockedAvatar} />
                ) : (
                  <View style={[styles.blockedAvatar, styles.blockedAvatarPlaceholder, { backgroundColor: colors.border }]}>
                    <Text style={[styles.blockedAvatarInitial, primaryText]}>{initial}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.blockedNameText, primaryText]}>{u.name || u.email}</Text>
                </View>
                <TouchableOpacity onPress={() => void handleUnblock(u.id)} accessibilityRole="button">
                  <Text style={styles.unblockLink}>Unblock</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>

      <View style={styles.logout}>
        <TouchableOpacity
          style={[styles.logoutPill, cardSurface]}
          onPress={handleLogout}
          accessibilityRole="button"
        >
          <Text style={styles.logoutPillText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ✅ Styles
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f2f2f2" },
  scrollContent: { alignItems: "center", padding: 20, paddingBottom: 40 },
  card: { backgroundColor: "white", padding: 20, borderRadius: 10, width: "100%", maxWidth: 580, marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 3, borderWidth: StyleSheet.hairlineWidth },
  cardHeader: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 15, textAlign: "center" },
  label: { fontSize: 16, fontWeight: "600", marginTop: 10 },
  labelCount: { fontSize: 13, color: "#66a8ff", fontWeight: "500" },
  value: { fontSize: 16, color: "#333" },
  valueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  nameValue: { flex: 1, marginRight: 12 },
  nameEditContainer: { marginTop: 8, width: "100%" },
  nameInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: "#333", backgroundColor: "#fff" },
  nameActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 12 },
  nameActionButton: { marginLeft: 12 },
  nameActionButtonFirst: { marginLeft: 0 },
  nameError: { marginTop: 8 },
  disabledAction: { opacity: 0.5 },
  divider: { marginVertical: 16, height: 1, backgroundColor: "#eee" },
  tagHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tagHeaderActions: { flexDirection: "row", alignItems: "center" },
  savingIndicator: { marginRight: 8 },
  toggleText: { color: "#007BFF", fontWeight: "600" },
  emptyTags: { marginTop: 8, fontSize: 14, color: "#666" },
  selectedTagsWrapper: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  selectedChip: { backgroundColor: "#e6f0ff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth },
  selectedChipText: { color: "#66a8ff", fontSize: 14, fontWeight: "500" },
  catalogSection: { marginTop: 16, borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12, backgroundColor: "#fafafa" },
  tagSearchWrapper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingHorizontal: 12, marginBottom: 12, backgroundColor: "#fff" },
  tagSearchInput: { flex: 1, paddingVertical: 8, fontSize: 14, color: "#333" },
  tagSearchClear: { marginLeft: 8 },
  tagSearchClearText: { color: "#007BFF", fontSize: 13, fontWeight: "600" },
  catalogGrid: { flexDirection: "row", flexWrap: "wrap" },
  tagOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: "#ccc", backgroundColor: "#fff", marginRight: 8, marginBottom: 8 },
  tagOptionSelected: { borderColor: "#007BFF", backgroundColor: "#e6f0ff" },
  tagOptionDisabled: { opacity: 0.6 },
  tagOptionText: { fontSize: 14, color: "#333" },
  tagOptionTextSelected: { color: "#66a8ff", fontWeight: "600" },
  catalogLoading: { flexDirection: "row", alignItems: "center" },
  catalogLoadingText: { marginLeft: 8 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  themeRow: { flexDirection: "row", gap: 10, marginTop: 12 },
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
  themeNote: { marginTop: 6, fontSize: 13, color: "#666", textAlign: "left" },
  helperText: { marginTop: 12, fontSize: 13, color: "#666" },
  errorText: { marginTop: 12, fontSize: 13, color: "#c00" },
  logout: { width: "100%", maxWidth: 580, marginTop: 24, marginBottom: 36 },
  logoutPill: {
    backgroundColor: "#fff",
    borderRadius: 28,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  logoutPillText: { color: "#d9534f", fontWeight: "700", fontSize: 16 },
  profilePictureSection: { alignItems: "center", marginBottom: 20 },
  profilePictureWrapper: { position: "relative" },
  profilePicture: { width: 120, height: 120, borderRadius: 60, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: "#e5e7eb" },
  profilePlaceholder: { backgroundColor: "#ddd", justifyContent: "center", alignItems: "center" },
  profileUploadFab: { position: "absolute", bottom: 6, right: 6, width: 40, height: 40, borderRadius: 20, backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3, elevation: 4 },
  displayNameText: { fontSize: 22, fontWeight: "700", marginTop: 6, marginBottom: 4, textAlign: "center" },
  displayNameTextFull: { flexShrink: 1 },
  displayNameRow: { marginTop: 4, width: "100%", alignItems: "center" },
  inlineNameReadRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", alignSelf: "center", maxWidth: 360, width: "100%" },
  inlineNameEditRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", width: "100%", maxWidth: 360 },
  inlineNameIcon: { marginLeft: 8, padding: 6 },
  inlineNameEditButton: {},
  inlineNameIconGhost: { width: 30, height: 30, marginRight: 8 },
  inlineNameInput: { flex: 1, minWidth: 180, maxWidth: 260, marginRight: 4 },
  blockedSection: {
    marginTop: 24,
    width: "100%",
    maxWidth: 580,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e6e6e6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  blockedHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  blockedRowItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e5e5e5" },
  blockedAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  blockedAvatarPlaceholder: { backgroundColor: "#eee", justifyContent: "center", alignItems: "center" },
  blockedAvatarInitial: { fontSize: 14, fontWeight: "700", color: "#555" },
  blockedNameText: { fontSize: 16 },
  unblockLink: { color: "#dc3545", fontWeight: "700" },
  link: { color: "#007BFF", fontWeight: "600" },
  linkDisabled: { opacity: 0.5 },
});
