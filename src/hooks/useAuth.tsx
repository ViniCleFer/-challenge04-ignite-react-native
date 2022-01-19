import * as AuthSession from 'expo-auth-session';
import React, {
  useEffect,
  createContext,
  useContext,
  useState,
  ReactNode,
} from 'react';
import { generateRandom } from 'expo-auth-session/build/PKCE';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { CLIENT_ID } = process.env;

import { api } from '../services/api';

interface User {
  id: number;
  display_name: string;
  email: string;
  profile_image_url: string;
}

interface AuthContextData {
  user: User;
  isLoggingOut: boolean;
  isLoggingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

interface AuthProviderData {
  children: ReactNode;
}

interface AuthorizationResponse {
  params: {
    access_token: string;
  };
  type: string;
}

WebBrowser.maybeCompleteAuthSession();

const AuthContext = createContext({} as AuthContextData);

const twitchEndpoint = {
  authorization: 'https://id.twitch.tv/oauth2/authorize',
  revocation: 'https://id.twitch.tv/oauth2/revoke',
  token: 'https://id.twitch.tv/oauth2/token',
};

function AuthProvider({ children }: AuthProviderData) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [user, setUser] = useState({} as User);
  const [userToken, setUserToken] = useState('');

  const userStorageKey = '@streamData:user';

  useEffect(() => {
    api.defaults.headers['Client-Id'] = CLIENT_ID;
  }, []);

  async function signIn() {
    try {
      setIsLoggingIn(true);

      const REDIRECT_URI = AuthSession.makeRedirectUri({ useProxy: true });
      const RESPONSE_TYPE = 'token';
      const SCOPE = encodeURI('openid user:read:email user:read:follows');
      const STATE_GENERATED = generateRandom(30);

      const authUrl = `${twitchEndpoint.authorization}?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=${RESPONSE_TYPE}&scope=${SCOPE}&force_verify=true&state=${STATE_GENERATED}`;

      const { params, type } = (await AuthSession.startAsync({
        authUrl,
      })) as AuthorizationResponse;

      setUserToken(params.access_token);

      if (type === 'success') {
        api.defaults.headers.authorization = `Bearer ${userToken}`;

        const response = await api.get('users');

        const userResponse = response.data;

        const userLogged: User = {
          id: userResponse.data[0].id,
          display_name: userResponse.data[0].display_name,
          email: userResponse.data[0].email,
          profile_image_url: userResponse.data[0].profile_image_url,
        };

        setUser(userLogged);
        await AsyncStorage.setItem(userStorageKey, JSON.stringify(userLogged));
      }
    } catch (error) {
      console.log(error);
      throw new Error(error);
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function signOut() {
    try {
      setIsLoggingOut(true);
      await AuthSession.revokeAsync(
        { token: userToken, clientId: CLIENT_ID },
        { revocationEndpoint: twitchEndpoint.revocation }
      );
    } catch (error) {
    } finally {
      await AsyncStorage.removeItem(userStorageKey);
      setUser({} as User);
      setUserToken('');
      delete api.defaults.headers.authorization;
      setIsLoggingOut(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoggingOut, isLoggingIn, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);

  return context;
}

export { AuthProvider, useAuth };
