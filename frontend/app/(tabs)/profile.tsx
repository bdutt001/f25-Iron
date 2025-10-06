import React, { useState, useEffect } from "react";
import {
  Button,
  StyleSheet,
  Text,
  View,
  Image,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useUser } from "../context/UserContext";
import { useRouter } from "expo-router";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:8000/api";

// Define type for user response
type UserResponse = {
  id: number;
  name: string | null;
  email: string;
  status: string;
  profilePicture: string | null;
};

export default function ProfileScreen() {
  const router = useRouter();
  const { status } = useUser(); // shared state

  const [name, setName] = useState("Unnamed");
  const [email, setEmail] = useState("(unknown)");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);

  const hardcodedEmail = "ashaf007@odu.edu"; // replace later with logged-in user email

  // Fetch user info from backend
  const fetchUser = async () => {
    const url = `${API_BASE_URL}/users/by-email/${encodeURIComponent(
      hardcodedEmail
    )}`;
    console.log("🔎 Fetching user from:", url);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to load user");
      }

      const data: UserResponse = await response.json();
      console.log("✅ User data received:", data);

      setName(data.name || "Unnamed");
      setEmail(data.email);
      if (data.profilePicture) {
        setProfilePicture(
          `${API_BASE_URL.replace("/api", "")}${data.profilePicture}`
        );
      }
    } catch (error) {
      console.error("❌ Error in fetchUser:", error);
      Alert.alert("Error", "Failed to load user");
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  // Pick image from device
  const pickImage = async () => {
    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert("Permission required", "We need access to your photos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], // ✅ works with your installed version
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      console.log("📸 Picked URI:", uri);
      setProfilePicture(uri); // show immediately
      await uploadImage(uri);
    }
  };

  // Upload image to backend
  const uploadImage = async (uri: string) => {
    try {
      const formData = new FormData();
      formData.append("image", {
        uri,
        name: "profile.jpg",
        type: "image/jpeg",
      } as any);

      const response = await fetch(
        `${API_BASE_URL}/users/by-email/${encodeURIComponent(
          hardcodedEmail
        )}/profile-picture`,
        {
          method: "POST",
          body: formData, // ✅ no Content-Type header, RN sets it automatically
        }
      );

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const data: { profilePicture: string } = await response.json();
      console.log("✅ Uploaded:", data);

      setProfilePicture(
        `${API_BASE_URL.replace("/api", "")}${data.profilePicture}`
      );

      // refresh user info to keep everything in sync
      fetchUser();
    } catch (error) {
      console.error(error);
      Alert.alert("Upload failed", "Could not upload profile picture.");
    }
  };

  const handleLogout = () => {
    router.replace("/login");
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>User Profile</Text>

        {/* Profile picture */}
        {profilePicture ? (
          <Image source={{ uri: profilePicture }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text>No Picture</Text>
          </View>
        )}
        <Button title="Upload Profile Picture" onPress={pickImage} />

        {/* User info */}
        <Text style={styles.label}>Name:</Text>
        <Text style={styles.value}>{name}</Text>
        <Text style={styles.label}>Email:</Text>
        <Text style={styles.value}>{email}</Text>
        <Text style={styles.label}>Status:</Text>
        <Text style={styles.value}>{status}</Text>
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
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  image: {
  width: 200,
  height: 200,
  borderRadius: 100,
  resizeMode: "cover",  // keeps it square inside the circle
},
  placeholder: {
    backgroundColor: "#ddd",
    justifyContent: "center",
    alignItems: "center",
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
  logout: {
    width: "90%",
  },
});
