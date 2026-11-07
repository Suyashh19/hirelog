import { useEffect } from 'react';
import { View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { router } from 'expo-router';
import { brand } from '../ui/theme';

/**
 * Google sends the user back to …/auth-callback. The sign-in screen reads that link itself,
 * but Android can also hand it to the router: this screen just steps out of the way.
 */
export default function AuthCallback() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.bg }}>
      <ActivityIndicator />
    </View>
  );
}
