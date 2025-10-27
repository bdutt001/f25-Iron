import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, Image } from "react-native";
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useUser, type CurrentUser } from "../../context/UserContext";
import { fetchTagCatalog, updateUserProfile, API_BASE_URL } from "@/utils/api";

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
  const router = useRouter();
  const { status, currentUser, setCurrentUser, accessToken } = useUser();

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

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
    if (!accessToken) return;

    const loadTags = async () => {
      setLoadingTags(true);
      setTagError(null);
      try {
        const tags = await fetchTagCatalog(accessToken);
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
  }, [accessToken]);

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
    if (!currentUser || !accessToken) return;

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
      const updated = await updateUserProfile(
        currentUser.id,
        { name: trimmed },
        accessToken
      );
      applyUserUpdate(updated);
      setNameInput(updated.name ?? trimmed);
      setIsEditingName(false);
      Alert.alert("Success", "Name updated!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update name";
      setNameError(message);
    } finally {
      setSavingName(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    router.replace("/login");
  };

  // ✅ Stable version for Android + iOS
  const uploadImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
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
      console.log("📸 Selected image URI:", uri);

      if (!currentUser || !accessToken) {
        Alert.alert("Error", "You must be logged in to upload a profile picture.");
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

      Alert.alert("Success", "Profile picture updated!");
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert("Upload failed", "Please try again later.");
    }
  };

  const handleToggleTag = async (tag: string) => {
    if (!currentUser || !accessToken) return;

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
      const updated = await updateUserProfile(
        currentUser.id,
        { interestTags: sortedNext },
        accessToken
      );
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

  const displayName =
    currentUser?.name && currentUser.name.trim().length > 0
      ? currentUser.name
      : currentUser?.email || "Anonymous";

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>User Profile</Text>

        {/* ✅ Profile Picture Section */}
        <View style={styles.profilePictureSection}>
          {profilePicture ? (
            <Image source={{ uri: profilePicture }} style={styles.profilePicture} />
          ) : (
            <View style={[styles.profilePicture, styles.profilePlaceholder]}>
              <Text>No Picture</Text>
            </View>
          )}
          <Button title="Upload Profile Picture" onPress={uploadImage} />
        </View>

        <Text style={styles.label}>Name:</Text>
        {isEditingName ? (
          <View style={styles.nameEditContainer}>
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
              style={styles.nameInput}
              accessibilityLabel="Name input"
            />
            {nameError && (
              <Text style={[styles.errorText, styles.nameError]}>{nameError}</Text>
            )}
            <View style={styles.nameActions}>
              <View style={[styles.nameActionButton, styles.nameActionButtonFirst]}>
                <Button
                  title={savingName ? "Saving..." : "Save"}
                  onPress={handleSaveName}
                  disabled={savingName}
                />
              </View>
              <View style={styles.nameActionButton}>
                <Button
                  title="Cancel"
                  onPress={handleCancelNameEdit}
                  color="#6c757d"
                  disabled={savingName}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.valueRow}>
            <Text style={[styles.value, styles.nameValue]}>{displayName}</Text>
            <TouchableOpacity
              onPress={startNameEdit}
              disabled={!currentUser}
              accessibilityRole="button"
              accessibilityLabel="Edit display name"
              style={!currentUser ? styles.disabledAction : undefined}
            >
              <Text style={styles.toggleText}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.label}>Email:</Text>
        <Text style={styles.value}>{currentUser?.email || "-"}</Text>
        <Text style={styles.label}>Status:</Text>
        <Text style={styles.value}>{status}</Text>

        <View style={styles.divider} />

        {/* ✅ Interest Tags Section (unchanged) */}
        <View style={styles.tagHeader}>
          <Text style={styles.label}>
            Interest Tags
            {expanded && (
              <Text style={styles.labelCount}>{` (${selectedTags.length}/${MAX_INTEREST_TAGS})`}</Text>
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
          <Text style={styles.emptyTags}>{collapsedMessage}</Text>
        ) : (
          <View style={styles.selectedTagsWrapper}>
            {displayedSelectedTags.map((tag) => (
              <View key={tag} style={styles.selectedChip}>
                <Text style={styles.selectedChipText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {expanded && (
          <View style={styles.catalogSection}>
            <View style={styles.tagSearchWrapper}>
              <TextInput
                value={tagSearch}
                onChangeText={setTagSearch}
                placeholder="Search tags"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                style={styles.tagSearchInput}
                accessibilityLabel="Search interest tags"
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
                <Text style={[styles.helperText, styles.catalogLoadingText]}>
                  Loading tag catalog…
                </Text>
              </View>
            ) : (
              filteredTagOptions.length > 0 && (
                <ScrollView style={styles.catalogScroll}>
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
                          ]}
                          onPress={() => handleToggleTag(tag)}
                          disabled={savingTags}
                        >
                          <Text
                            style={[
                              styles.tagOptionText,
                              selected && styles.tagOptionTextSelected,
                            ]}
                          >
                            {tag}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              )
            )}
            {tagError && <Text style={styles.errorText}>{tagError}</Text>}
            {noMatches && (
              <Text style={styles.helperText}>
                {`No matches found for ${searchTerm}. Try a different keyword.`}
              </Text>
            )}
            {noCatalogTags && (
              <Text style={styles.helperText}>
                No tags available yet. Ask an admin to populate the catalog.
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.logout}>
        <Button title="Logout" onPress={handleLogout} color="#d9534f" />
      </View>
    </View>
  );
}

// ✅ Styles
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f2f2f2", padding: 20 },
  card: { backgroundColor: "white", padding: 20, borderRadius: 10, width: "90%", marginBottom: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 3 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 15, textAlign: "center" },
  label: { fontSize: 16, fontWeight: "600", marginTop: 10 },
  labelCount: { fontSize: 13, color: "#1f5fbf", fontWeight: "500" },
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
  selectedChip: { backgroundColor: "#e6f0ff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginRight: 8, marginBottom: 8 },
  selectedChipText: { color: "#1f5fbf", fontSize: 14, fontWeight: "500" },
  catalogSection: { marginTop: 16, borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12, backgroundColor: "#fafafa", maxHeight: 260 },
  tagSearchWrapper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingHorizontal: 12, marginBottom: 12, backgroundColor: "#fff" },
  tagSearchInput: { flex: 1, paddingVertical: 8, fontSize: 14, color: "#333" },
  tagSearchClear: { marginLeft: 8 },
  tagSearchClearText: { color: "#007BFF", fontSize: 13, fontWeight: "600" },
  catalogScroll: { maxHeight: 200 },
  catalogGrid: { flexDirection: "row", flexWrap: "wrap" },
  tagOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: "#ccc", backgroundColor: "#fff", marginRight: 8, marginBottom: 8 },
  tagOptionSelected: { borderColor: "#007BFF", backgroundColor: "#e6f0ff" },
  tagOptionDisabled: { opacity: 0.6 },
  tagOptionText: { fontSize: 14, color: "#333" },
  tagOptionTextSelected: { color: "#1f5fbf", fontWeight: "600" },
  catalogLoading: { flexDirection: "row", alignItems: "center" },
  catalogLoadingText: { marginLeft: 8 },
  helperText: { marginTop: 12, fontSize: 13, color: "#666" },
  errorText: { marginTop: 12, fontSize: 13, color: "#c00" },
  logout: { width: "90%" },
  profilePictureSection: { alignItems: "center", marginBottom: 20 },
  profilePicture: { width: 120, height: 120, borderRadius: 60, marginBottom: 10 },
  profilePlaceholder: { backgroundColor: "#ddd", justifyContent: "center", alignItems: "center" },
});
