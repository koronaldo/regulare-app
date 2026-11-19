import { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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
import { Ionicons } from '@expo/vector-icons';

import { autenticarLegado } from '../src/services/auth';

type Mensagem = { tipo: 'sucesso' | 'erro'; texto: string };

/**
 * `Dimensions.get('screen')` (física do aparelho) em vez de `'window'` (área visível do app) —
 * no Android, com o teclado aberto, o modo adjustResize encolhe a "window" e o LinearGradient
 * com flex:1 recalculava as cores sobre essa altura menor, deixando a tela com aspecto
 * "desbotado"/escurecido enquanto o teclado estava ativo. Fixando o fundo no tamanho da tela
 * física (que não muda com o teclado) resolve isso.
 */
const { width: LARGURA_TELA, height: ALTURA_TELA } = Dimensions.get('screen');

export default function LoginScreen() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
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
    <View style={styles.container}>
      <StatusBar style="light" />

      <LinearGradient
        colors={['#4aa3ff', '#1c3d5a', '#0f2436']}
        locations={[0, 0.52, 1]}
        start={{ x: 0.18, y: 0 }}
        end={{ x: 0.82, y: 1 }}
        style={[styles.fundo, { width: LARGURA_TELA, height: ALTURA_TELA }]}
      />

      <KeyboardAvoidingView style={styles.form} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
          cursorColor="#ffffff"
          selectionColor="rgba(255,255,255,0.4)"
        />
        <View style={styles.senhaContainer}>
          <TextInput
            style={[styles.input, styles.inputSenha]}
            placeholder="Senha"
            placeholderTextColor="rgba(255,255,255,0.6)"
            secureTextEntry={!mostrarSenha}
            autoCapitalize="none"
            autoCorrect={false}
            value={senha}
            onChangeText={setSenha}
            editable={!loading}
            cursorColor="#ffffff"
            selectionColor="rgba(255,255,255,0.4)"
          />
          <TouchableOpacity
            style={styles.olhoBotao}
            onPress={() => setMostrarSenha((v) => !v)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
          >
            <Ionicons
              name={mostrarSenha ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color="rgba(255,255,255,0.8)"
            />
          </TouchableOpacity>
        </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fundo: {
    position: 'absolute',
    top: 0,
    left: 0,
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
  senhaContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputSenha: {
    paddingRight: 48,
  },
  olhoBotao: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 14,
    justifyContent: 'center',
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
