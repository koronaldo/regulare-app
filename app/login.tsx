import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { autenticarLegado } from '../src/services/auth';

type Mensagem = { tipo: 'sucesso' | 'erro'; texto: string };

export default function LoginScreen() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);

  async function handleLogin() {
    if (!usuario.trim() || !senha.trim()) {
      setMensagem({ tipo: 'erro', texto: 'Preencha usuário e senha.' });
      return;
    }

    setMensagem(null);
    setLoading(true);
    try {
      const resultado = await autenticarLegado(usuario.trim(), senha);

      if (resultado.success) {
        router.replace({
          pathname: '/dashboard',
          params: {
            codusu: String(resultado.codusu),
            codreg: String(resultado.codreg),
            nomusu: resultado.nomusu,
            nomregula: resultado.nomregula,
          },
        });
      } else {
        setMensagem({ tipo: 'erro', texto: resultado.message });
      }
    } catch (error) {
      setMensagem({
        tipo: 'erro',
        texto: `Erro inesperado: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient
      colors={['#4aa3ff', '#1c3d5a', '#0f2436']}
      locations={[0, 0.52, 1]}
      start={{ x: 0.18, y: 0 }}
      end={{ x: 0.82, y: 1 }}
      style={styles.container}
    >
      <KeyboardAvoidingView style={styles.form} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <StatusBar style="light" />

        <View style={styles.header}>
          <Image source={require('../assets/logo-azul.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Regulare Mobile</Text>
          <Text style={styles.subtitle}>Acesse com seu usuário do sistema</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Usuário / e-mail"
          placeholderTextColor="rgba(255,255,255,0.6)"
          autoCapitalize="none"
          autoCorrect={false}
          value={usuario}
          onChangeText={setUsuario}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Senha"
          placeholderTextColor="rgba(255,255,255,0.6)"
          secureTextEntry
          value={senha}
          onChangeText={setSenha}
          editable={!loading}
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#1c3d5a" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        {mensagem && (
          <Text
            style={[
              styles.message,
              mensagem.tipo === 'sucesso' ? styles.success : styles.error,
            ]}
          >
            {mensagem.texto}
          </Text>
        )}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  logo: {
    width: 88,
    height: 88,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
    marginBottom: 14,
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#1c3d5a',
    fontSize: 16,
    fontWeight: '700',
  },
  message: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 14,
  },
  success: {
    color: '#8de6a8',
  },
  error: {
    color: '#ffb4ab',
  },
});
