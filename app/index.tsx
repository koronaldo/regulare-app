import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

const DURACAO_MS = 1800;

export default function AberturaScreen() {
  useEffect(() => {
    const id = setTimeout(() => {
      router.replace('/login');
    }, DURACAO_MS);
    return () => clearTimeout(id);
  }, []);

  return (
    <LinearGradient
      colors={['#4aa3ff', '#1c3d5a', '#0f2436']}
      locations={[0, 0.52, 1]}
      start={{ x: 0.18, y: 0 }}
      end={{ x: 0.82, y: 1 }}
      style={styles.container}
    >
      <StatusBar style="light" />
      <View style={styles.conteudo}>
        <Image source={require('../assets/logo-azul.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.titulo}>Regulare Mobile</Text>
        <Text style={styles.subtitulo}>Regulação de Sinistros</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  conteudo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 16,
  },
  titulo: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    color: '#fff',
  },
  subtitulo: {
    fontSize: 15,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 6,
  },
});
