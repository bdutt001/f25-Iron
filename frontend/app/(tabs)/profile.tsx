import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useUser } from "../../context/UserContext";
import {
  fetchTagCatalog,
  updateUserInterestTags,
} from "@/utils/api";

const sortTags = (tags: string[]): string[] => [...tags].sort((a, b) => a.localeCompare(b));

export default function ProfileScreen() {
  const router = useRouter();
  const { status, currentUser, setCurrentUser, accessToken } = useUser();

  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTags(currentUser?.interestTags ?? []);
  }, [currentUser?.interestTags]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) return undefined;

    const loadTags = async () => {
      setLoadingTags(true);
      setTagError(null);
      try {
        const tags = await fetchTagCatalog(accessToken);
        if (!cancelled) {
          setAvailableTags(tags);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Unable to load tags";
          setTagError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingTags(false);
        }
      }
    };

    void loadTags();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const handleLogout = () => {
    setCurrentUser(null);
    router.replace("/login");
  };

  // Demo function for testing reporting functionality
  const switchUser = () => {
    // Switch between Alice (ID: 21) and Ben (ID: 22) for testing
    const newUser = currentUser?.id === 21 
      ? { id: 22, email: "ben@example.com", name: "Ben Carter", interestTags: ["Board Games", "Tech", "Running"] }
      : { id: 21, email: "alice@example.com", name: "Alice Johnson", interestTags: ["Coffee", "Dogs", "Hiking"] };
    
    setCurrentUser(newUser);
  };

  const handleToggleTag = async (tag: string) => {
    if (!currentUser || !accessToken) return;

    const previous = [...selectedTags];
    const next = previous.includes(tag)
      ? previous.filter((t) => t !== tag)
      : [...previous, tag];
    const sortedNext = sortTags(next);

    setSelectedTags(sortedNext);
    setSavingTags(true);
    setTagError(null);

    try {
      const updated = await updateUserInterestTags(currentUser.id, sortedNext, accessToken);
      setCurrentUser({
        ...currentUser,
        ...updated,
        interestTags: updated.interestTags ?? [],
      });
      setSelectedTags(updated.interestTags ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update tags";
      setTagError(message);
      setSelectedTags(previous);
    } finally {
      setSavingTags(false);
    }
  };

  const displayedSelectedTags = useMemo(() => sortTags(selectedTags), [selectedTags]);
  const tagOptions = useMemo(() => {
    if (availableTags.length) return availableTags;
    return sortTags(Array.from(new Set([...selectedTags])));
  }, [availableTags, selectedTags]);

  const collapsedMessage =
    selectedTags.length === 0
      ? "No tags selected yet. Tap Edit to choose your interests."
      : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>User Profile</Text>
        <Text style={styles.label}>Name:</Text>
        <Text style={styles.value}>{currentUser?.name || currentUser?.email || "Anonymous"}</Text>
        <Text style={styles.label}>Email:</Text>
        <Text style={styles.value}>{currentUser?.email || "-"}</Text>
        <Text style={styles.label}>Status:</Text>
        <Text style={styles.value}>{status}</Text>

        <View style={styles.divider} />

        <View style={styles.tagHeader}>
          <Text style={styles.label}>Interest Tags</Text>
          <View style={styles.tagHeaderActions}>
            {savingTags && <ActivityIndicator size="small" color="#007BFF" style={styles.savingIndicator} />}
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
            {loadingTags ? (
              <View style={styles.catalogLoading}>
                <ActivityIndicator size="small" color="#007BFF" style={styles.savingIndicator} />
                <Text style={[styles.helperText, styles.catalogLoadingText]}>Loading tag catalog…</Text>
              </View>
            ) : (
              <ScrollView style={styles.catalogScroll}>
                <View style={styles.catalogGrid}>
                  {tagOptions.map((tag) => {
                    const selected = selectedTags.includes(tag);
                    return (
                      <TouchableOpacity
                        key={tag}
                        style={[
                          styles.tagOption,
                          selected && styles.tagOptionSelected,
                          savingTags && styles.tagOptionDisabled,
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
            )}
            {tagError && <Text style={styles.errorText}>{tagError}</Text>}
            {!loadingTags && !tagOptions.length && (
              <Text style={styles.helperText}>
                No tags available yet. Ask an admin to populate the catalog.
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.logout}>
        <Button title="Switch User (Demo)" onPress={switchUser} color="#007BFF" />
      </View>
      
      <View style={styles.logout}>
        <Button title="Logout" onPress={handleLogout} color="#d9534f" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f2f2f2",
    padding: 20,
  },
  card: {
    backgroundColor: "white",
    padding: 20,
    borderRadius: 10,
    width: "90%",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 10,
  },
  value: {
    fontSize: 16,
    color: "#333",
  },
  divider: {
    marginVertical: 16,
    height: 1,
    backgroundColor: "#eee",
  },
  tagHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  tagHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  savingIndicator: {
    marginRight: 8,
  },
  toggleText: {
    color: "#007BFF",
    fontWeight: "600",
  },
  emptyTags: {
    marginTop: 8,
    fontSize: 14,
    color: "#666",
  },
  selectedTagsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
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
  catalogSection: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fafafa",
    maxHeight: 260,
  },
  catalogScroll: {
    maxHeight: 200,
  },
  catalogGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  catalogLoading: {
    flexDirection: "row",
    alignItems: "center",
  },
  catalogLoadingText: {
    marginLeft: 8,
  },
  helperText: {
    marginTop: 12,
    fontSize: 13,
    color: "#666",
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    color: "#c00",
  },
  logout: {
    width: "90%",
  },
});






