import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { billPreviewHtml, shareBillOnWhatsApp, shareBillPdf } from '../../bills/share';
import { brand, radius } from '../../ui/theme';

/**
 * Shows the bill exactly as the PDF will look, inside the app.
 * (The system print screen is missing or switched off on many phones, so it is not used for previews.)
 */
export default function BillPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void billPreviewHtml(id).then((h) => {
      // fit the A4-style page to the phone width
      if (alive) setHtml(h ? h.replace('<meta name="viewport" content="width=device-width"/>', '<meta name="viewport" content="width=device-width, initial-scale=1"/>') : null);
    });
    return () => { alive = false; };
  }, [id]);
  const [loading, setLoading] = useState(true);

  if (html === undefined) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={brand.primary} /></View>;
  }
  if (!html) {
    return <View style={{ padding: 24 }}><Text>This bill could not be found.</Text></View>;
  }
  return (
    <View style={{ flex: 1, backgroundColor: brand.bg }}>
      <View style={{ flex: 1, margin: 12, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: brand.line }}>
        <WebView
          originWhitelist={['*']}
          source={{ html }}
          onLoadEnd={() => setLoading(false)}
          setBuiltInZoomControls
          setDisplayZoomControls={false}
          style={{ flex: 1, backgroundColor: '#fff' }}
        />
        {loading ? (
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={brand.primary} />
          </View>
        ) : null}
      </View>
      <SafeAreaView edges={['bottom']} style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingBottom: 12 }}>
        <Button mode="contained" icon="whatsapp" onPress={() => shareBillOnWhatsApp(id)} style={{ flex: 1, borderRadius: radius.pill }} contentStyle={{ minHeight: 50 }}>
          WhatsApp
        </Button>
        <Button mode="outlined" icon="file-pdf-box" onPress={() => shareBillPdf(id)} style={{ flex: 1, borderRadius: radius.pill }} contentStyle={{ minHeight: 50 }}>
          Share PDF
        </Button>
      </SafeAreaView>
    </View>
  );
}
