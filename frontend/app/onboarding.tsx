import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Button,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
// Use standard fetch + FormData for uploads to avoid legacy module types

import { useUser } from "../context/UserContext";
import {
  API_BASE_URL,
  fetchTagCatalog,
  updateUserProfile,
} from "@/utils/api";

const MAX_INTEREST_TAGS = 10;

const sortTags = (tags: string[]): string[] => [...tags].sort((a, b) => a.localeCompare(b));

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

export default function OnboardingScreen() {
  const router = useRouter();
  const { currentUser, setCurrentUser, accessToken, setPrefetchedUsers } = useUser();

  const [nameInput, setNameInput] = useState(currentUser?.name?.trim() ?? "");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(
    currentUser?.interestTags ?? []
  );
  const [loadingTags, setLoadingTags] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const [profilePicture, setProfilePicture] = useState<string | null>(
    currentUser?.profilePicture
      ? currentUser.profilePicture.startsWith("http")
        ? currentUser.profilePicture
        : `${API_BASE_URL}${currentUser.profilePicture}`
      : null
  );

  useEffect(() => {
    if (!currentUser || !accessToken) {
      router.replace("/login");
    }
  }, [accessToken, currentUser, router]);

  useEffect(() => {
    if (!currentUser) return;
    setNameInput(currentUser.name?.trim() ?? "");
    setSelectedTags(currentUser.interestTags ?? []);
  }, [currentUser]);

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

  const tagOptions = useMemo(() => {
    if (availableTags.length) return availableTags;
    return sortTags(Array.from(new Set([...selectedTags])));
  }, [availableTags, selectedTags]);

  const searchTerm = tagSearch.trim();
  const filteredTagOptions = useMemo(
    () => fuzzyFilter(tagOptions, searchTerm),
    [tagOptions, searchTerm]
  );

  const limitReached = selectedTags.length >= MAX_INTEREST_TAGS;

  const handleToggleTag = (tag: string) => {
    setTagError(null);

    const isRemoving = selectedTags.includes(tag);
    if (!isRemoving && limitReached) {
      setTagError(`You can select up to ${MAX_INTEREST_TAGS} interest tags.`);
      return;
    }

    const next = isRemoving
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(sortTags(next));
  };

  const uploadImage = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission required",
          "You must grant photo access to upload a profile picture."
        );
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

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
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
        if (currentUser) {
          setCurrentUser({ ...currentUser, profilePicture: newUrl });
        }
      }

      Alert.alert("Success", "Profile picture updated!");
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert("Upload failed", "Please try again later.");
    }
  }, [accessToken, currentUser, setCurrentUser]);

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
        accessToken
      );

      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              ...updated,
              interestTags: updated.interestTags ?? prev.interestTags,
              profilePicture: updated.profilePicture ?? prev.profilePicture,
              visibility: updated.visibility ?? prev.visibility,
            }
          : updated
      );

      setPrefetchedUsers(null);
      router.replace("/(tabs)/profile");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save profile";
      Alert.alert("Onboarding", message);
    } finally {
      setSaving(false);
    }
  };

  const displayedSelectedTags = useMemo(
    () => sortTags(selectedTags),
    [selectedTags]
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Welcome to MingleMap!</Text>
      <Text style={styles.subtitle}>
        Complete your profile so people nearby know who you are.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile Picture</Text>
        <View style={styles.pictureWrapper}>
          {profilePicture ? (
            <Image source={{ uri: profilePicture }} style={styles.profilePicture} />
          ) : (
            <View style={[styles.profilePicture, styles.picturePlaceholder]}>
              <Text style={styles.placeholderText}>No Picture</Text>
            </View>
          )}
          <Button title="Upload Photo" onPress={uploadImage} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          value={nameInput}
          onChangeText={(value) => {
            setNameError(null);
            setNameInput(value);
          }}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="done"
        />
        {nameError && <Text style={styles.errorText}>{nameError}</Text>}
      </View>

      <View style={styles.section}>
        <View style={styles.tagHeader}>
          <Text style={styles.sectionTitle}>Interest Tags</Text>
          <Text style={styles.tagCount}>{`${selectedTags.length}/${MAX_INTEREST_TAGS}`}</Text>
        </View>

        <View style={styles.tagSearchWrapper}>
          <TextInput
            value={tagSearch}
            onChangeText={setTagSearch}
            placeholder="Search tags"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.tagSearchInput}
          />
          {searchTerm.length > 0 && (
            <TouchableOpacity
              onPress={() => setTagSearch("")}
              style={styles.tagSearchClear}
            >
              <Text style={styles.tagSearchClearText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {loadingTags ? (
          <View style={styles.catalogLoading}>
            <ActivityIndicator size="small" color="#007BFF" />
            <Text style={styles.catalogLoadingText}>Loading tag catalog…</Text>
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
                    selected && styles.tagOptionSelected,
                    disabled && styles.tagOptionDisabled,
                  ]}
                  disabled={saving}
                  onPress={() => handleToggleTag(tag)}
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
        )}
        {tagError && <Text style={styles.errorText}>{tagError}</Text>}

        {displayedSelectedTags.length > 0 && (
          <View style={styles.selectedTagsWrapper}>
            {displayedSelectedTags.map((tag) => (
              <View key={tag} style={styles.selectedChip}>
                <Text style={styles.selectedChipText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Button
          title={saving ? "Saving..." : "Continue"}
          onPress={handleContinue}
          disabled={saving}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: "#f5f7fa",
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
  },
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
  },
  picturePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#555",
    fontWeight: "600",
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
    color: "#1f5fbf",
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
    color: "#1f5fbf",
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
  },
  selectedChipText: {
    color: "#1f5fbf",
    fontSize: 14,
    fontWeight: "500",
  },
  actions: {
    marginBottom: 24,
  },
});
