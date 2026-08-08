import { StyleSheet, Text, View, type ViewProps } from 'react-native';

interface SecaoProps extends ViewProps {
  titulo: string;
}

export function Secao({ titulo, children, style, ...resto }: SecaoProps) {
  return (
    <View style={[styles.container, style]} {...resto}>
      <Text style={styles.titulo}>{titulo}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  titulo: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c3d5a',
    textTransform: 'uppercase',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
});
