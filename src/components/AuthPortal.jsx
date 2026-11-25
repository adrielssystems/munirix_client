'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Script from 'next/script';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import SoftAurora from '@/components/ui/SoftAurora';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Settings2,
  User,
} from 'lucide-react';
import styles from '@/app/login/login.module.css';

const EASE_OUT = [0.23, 1, 0.32, 1];

function GoogleLogoSvg() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

function mapNextAuthError(code) {
  if (!code) return '';
  if (code === 'CredentialsSignin') return 'Correo o contraseña incorrectos.';
  if (code === 'OAuthSignin' || code === 'OAuthCallback') {
    return 'No se pudo completar el acceso con Google. Verifica tu configuración OAuth e inténtalo de nuevo.';
  }
  if (code === 'AccessDenied') return 'Acceso denegado para esta cuenta.';
  return decodeURIComponent(code);
}

function detectEmailTypo(emailValue) {
  const lower = String(emailValue || '').trim().toLowerCase();
  if (lower.endsWith('@gmial.com')) return lower.replace('@gmial.com', '@gmail.com');
  if (lower.endsWith('@gamil.com')) return lower.replace('@gamil.com', '@gmail.com');
  if (lower.endsWith('@gnail.com')) return lower.replace('@gnail.com', '@gmail.com');
  if (lower.endsWith('@hotnail.com')) return lower.replace('@hotnail.com', '@hotmail.com');
  return null;
}

export default function AuthPortal({
  initialMode = 'login',
  googleAuthEnabled = false,
  googleClientId = '',
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL || 'https://munirix.net';

  const [step, setStep] = useState('providers'); // 'providers' | 'email'
  const [emailMode, setEmailMode] = useState(initialMode === 'register' ? 'register' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState(() => mapNextAuthError(searchParams.get('error')));
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showGoogleSetupGuide, setShowGoogleSetupGuide] = useState(false);

  const oneTapInitializedRef = useRef(false);

  const handleOneTapCredential = useCallback(
    async (response) => {
      if (!response?.credential) return;
      setGoogleLoading(true);
      setError('');

      const res = await signIn('google-onetap', {
        redirect: false,
        credential: response.credential,
      });

      if (res?.error) {
        setError(mapNextAuthError(res.error));
        setGoogleLoading(false);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    },
    [router]
  );

  const initGoogleOneTap = useCallback(() => {
    if (!googleClientId || oneTapInitializedRef.current) return;
    if (typeof window === 'undefined' || !window.google?.accounts?.id) return;

    oneTapInitializedRef.current = true;
    try {
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleOneTapCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true,
        itp_support: true,
        context: initialMode === 'register' ? 'signup' : 'signin',
      });
      window.google.accounts.id.prompt();
    } catch {
      // Silencioso si el navegador bloquea prompts de terceros
    }
  }, [googleClientId, handleOneTapCredential, initialMode]);

  useEffect(() => {
    if (!googleClientId) return undefined;
    initGoogleOneTap();
    return () => {
      try {
        window.google?.accounts?.id?.cancel();
      } catch {
        // noop
      }
      oneTapInitializedRef.current = false;
    };
  }, [googleClientId, initGoogleOneTap]);

  const handleGoogleButtonClick = async () => {
    setError('');
    if (!googleAuthEnabled) {
      setShowGoogleSetupGuide((prev) => !prev);
      return;
    }

    setGoogleLoading(true);
    try {
      await signIn('google', { callbackUrl: '/dashboard' });
    } catch {
      setError('No se pudo redirigir a Google. Inténtalo nuevamente.');
      setGoogleLoading(false);
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (emailMode === 'register') {
        const regRes = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });
        const regData = await regRes.json();

        if (!regRes.ok) {
          setError(regData.error || 'No se pudo crear tu cuenta.');
          setIsLoading(false);
          return;
        }
      }

      const signInRes = await signIn('credentials', {
        redirect: false,
        email,
        password,
      });

      if (signInRes?.error) {
        setError(mapNextAuthError(signInRes.error));
        setIsLoading(false);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Ocurrió un error de conexión. Inténtalo nuevamente.');
      setIsLoading(false);
    }
  };

  const typoSuggestion = detectEmailTypo(email);

  return (
    <MotionConfig reducedMotion="user">
      {googleClientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={initGoogleOneTap}
        />
      )}

      <div className={styles.container}>
        <div className={styles.auroraBg} aria-hidden="true">
          <SoftAurora
            color1="#7B6BF2"
            color2="#38C6EC"
            speed={0.42}
            scale={1.45}
            brightness={0.94}
            bandHeight={0.48}
            bandSpread={1.12}
            opacity={0.82}
          />
        </div>

        <a href={webUrl} className={styles.backLink}>
          <ArrowLeft size={16} />
          <span>Volver a Munirix Web</span>
        </a>

        <motion.div
          className={styles.card}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, ease: EASE_OUT }}
        >
          <div className={styles.brand}>
            <img
              src="/brand/Logo_Munirix_sin_fondo.png"
              alt="Munirix"
              className={styles.brandLogo}
            />
            <h1 className={styles.title}>Regístrate o inicia sesión</h1>
            <p className={styles.subtitle}>
              Crea y conecta tus agentes de IA personales o empresariales en minutos
            </p>
          </div>

          {error && (
            <div className={styles.errorMessage} role="alert">
              <AlertCircle size={17} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {step === 'providers' ? (
              <motion.div
                key="providers"
                className={styles.providerStack}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
              >
                <button
                  type="button"
                  className={styles.googleButton}
                  onClick={handleGoogleButtonClick}
                  disabled={googleLoading}
                >
                  {googleLoading ? (
                    <span className={styles.loader} />
                  ) : (
                    <>
                      <GoogleLogoSvg />
                      <span>Continuar con Google</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className={styles.emailOptionButton}
                  onClick={() => {
                    setError('');
                    setStep('email');
                  }}
                  disabled={googleLoading}
                >
                  <Mail size={18} strokeWidth={1.85} />
                  <span>Continuar con correo</span>
                </button>

                {showGoogleSetupGuide && !googleAuthEnabled && (
                  <div className={styles.setupNotice}>
                    <div className={styles.setupNoticeHeader}>
                      <Settings2 size={15} />
                      <span>Falta configurar Google OAuth en .env.local</span>
                    </div>
                    <p>
                      Agrega tus credenciales de <strong>Google Cloud Console</strong> en{' '}
                      <code>munirix_client/.env.local</code> y reinicia el servidor:
                    </p>
                    <pre className={styles.codeSnippet}>
{`GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=tu_client_secret
NEXT_PUBLIC_GOOGLE_CLIENT_ID=tu_client_id.apps.googleusercontent.com`}
                    </pre>
                    <p className={styles.setupMeta}>
                      Origen JS autorizado: <code>https://client.munirix.net</code>
                      <br />
                      URI de redirección:{' '}
                      <code>https://client.munirix.net/api/auth/callback/google</code>
                    </p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="email-form"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
              >
                <button
                  type="button"
                  className={styles.backToProviders}
                  onClick={() => {
                    setError('');
                    setStep('providers');
                  }}
                >
                  <ChevronLeft size={16} />
                  <span>Otras opciones de acceso</span>
                </button>

                <div className={styles.modeTabs} role="tablist" aria-label="Modo de acceso">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={emailMode === 'register'}
                    className={`${styles.modeTab} ${emailMode === 'register' ? styles.modeTabActive : ''}`}
                    onClick={() => {
                      setError('');
                      setEmailMode('register');
                    }}
                  >
                    Crear cuenta
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={emailMode === 'login'}
                    className={`${styles.modeTab} ${emailMode === 'login' ? styles.modeTabActive : ''}`}
                    onClick={() => {
                      setError('');
                      setEmailMode('login');
                    }}
                  >
                    Iniciar sesión
                  </button>
                </div>

                <form onSubmit={handleEmailSubmit} className={styles.form}>
                  {emailMode === 'register' && (
                    <div className={styles.inputGroup}>
                      <label htmlFor="name">Nombre completo</label>
                      <div className={styles.inputWrapper}>
                        <User size={16} className={styles.inputIcon} />
                        <input
                          id="name"
                          type="text"
                          placeholder="Tu nombre o el de tu clínica"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          minLength={2}
                          disabled={isLoading}
                          autoComplete="name"
                        />
                      </div>
                    </div>
                  )}

                  <div className={styles.inputGroup}>
                    <label htmlFor="email">Correo electrónico</label>
                    <div className={styles.inputWrapper}>
                      <Mail size={16} className={styles.inputIcon} />
                      <input
                        id="email"
                        type="email"
                        placeholder="tu@correo.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        autoComplete="email"
                      />
                    </div>
                    {typoSuggestion && (
                      <button
                        type="button"
                        className={styles.typoHint}
                        onClick={() => setEmail(typoSuggestion)}
                      >
                        ¿Quisiste decir <strong>{typoSuggestion}</strong>?
                      </button>
                    )}
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor="password">Contraseña</label>
                    <div className={styles.inputWrapper}>
                      <KeyRound size={16} className={styles.inputIcon} />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder={emailMode === 'register' ? 'Mínimo 8 caracteres' : '••••••••'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={emailMode === 'register' ? 8 : 1}
                        disabled={isLoading}
                        autoComplete={emailMode === 'register' ? 'new-password' : 'current-password'}
                        style={{ paddingRight: '2.65rem' }}
                      />
                      <button
                        type="button"
                        className={styles.eyeToggle}
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className={styles.submitButton} disabled={isLoading}>
                    {isLoading ? (
                      <span className={styles.loader} />
                    ) : (
                      <>
                        <span>
                          {emailMode === 'register' ? 'Crear mi cuenta' : 'Ingresar al Workspace'}
                        </span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={styles.trustFooter}>
            <div className={styles.trustBadge}>
              <Lock size={13} strokeWidth={2} />
              <span>Tus datos están seguros y totalmente privados.</span>
            </div>
            <p className={styles.legalText}>
              Al continuar, aceptas nuestros términos de uso y política de privacidad. Sin tarjeta
              requerida para comenzar.
            </p>
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
