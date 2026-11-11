import { Text, View } from 'react-native';
import { lightTheme } from '@provecheck/shared';

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: lightTheme.background,
      }}
    >
      <Text style={{ color: lightTheme.text, fontSize: 24, fontWeight: '600' }}>ProveCheck</Text>
    </View>
  );
}
