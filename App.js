/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow strict-local
 */

import React, {useEffect, useState} from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  NativeEventEmitter,
  NativeModules,
  Alert,
  Platform,
} from 'react-native';
import * as API from './api';
import {Button} from './components/Button';
import HarborLockersSDK from '@harborlockers/react-native-sdk';
import {PERMISSIONS, requestMultiple} from 'react-native-permissions';

const USER_NAME = 'yourAccount@email.here'; // fill with your username
const USER_PWD = 'yourPassword'; // fill with your password
const SDK_ENV = 'targetEnvironment'; // fill with your target sdk environment
const MY_TOWER_ID = 'yourTowerId'; // fill with your tower id
const SESSION_ROLE = 0b00000100;
const TOWER_SYNC_TIMEOUT = 30; // number of seconds to wait before tower sync timeouts
const DOOR_TIMEOUT = 6; // number of seconds to wait before door status check timeouts

/*If required to change the base url you can do so @ ./api.js */
const myUserAccount = {
  username: USER_NAME,
  password: USER_PWD,
  grant_type: 'password',
};

const initialState = {
  api_access_token: '',
  token_type: '',
  sdk_token: '',
  my_tower_is_connected: false,
  sdk_initializated: false,
  my_tower_in_range: false,
  my_tower_is_synced: false,
  can_reopen_locker: false,
  available_lockers: [],
};

// APP
const App = () => {
  const eventEmitter = new NativeEventEmitter(NativeModules.HarborLockersSDK);
  const [accessConfig, setAccessConfig] = useState({...initialState});

  // error alert display
  const displayAlert = (alertTitle, alertBody) => {
    Alert.alert(alertTitle, alertBody, [
      {
        text: 'OK',
        onPress: () => {},
      },
    ]);
  };

  // gets sdk & api tokens from api, authenticates user bearing the requested api token
  const loadConfig = async () => {
    try {
      const userData = await API.retrieveCredentials(myUserAccount);
      setAccessConfig({...accessConfig, ...userData});
    } catch (error) {
      displayAlert('Network error', 'Failed to retrieve credentials');
    }
  };

  // get the data of the lockers that are available for a drop off
  const getAvailableLockersForDropOff = async (towerId, bearerToken) => {
    try {
      const availableLockers = await API.getLockersInTower(
        towerId,
        bearerToken,
      );
      if (availableLockers.length !== 0) {
        setAccessConfig({
          ...accessConfig,
          available_lockers: [...availableLockers],
        });
      }
    } catch (error) {
      displayAlert('Network error', 'Failed to retrieve lockers');
    }
  };

  // Once we have our SDK authentication token we can initialize the HarborLockersSDK.
  const initSdk = (sdkToken, env) => {
    HarborLockersSDK.setAccessToken(sdkToken, env);
    HarborLockersSDK.initializeSDK();
    setAccessConfig({...accessConfig, sdk_initializated: true});
  };

  // ends current session with tower
  const endTowerSession = () => {
    HarborLockersSDK.sendTerminateSession(0, 'Session terminated by user');
    setAccessConfig({...initialState});
  };

  // Start bluetooth discovery of devices to stablish initial handshake with tower
  const discoverMyTower = () => {
    HarborLockersSDK.startTowersDiscovery();
  };

  // Connects to tower by providing the target tower id & starts a drop off session
  const connectToMyTower = towerId => {
    HarborLockersSDK.connectToTowerWithIdentifier(towerId)
      .then(_ => {
        HarborLockersSDK.sendRequestSession(
          SESSION_ROLE,
          (errorCode, errorMessage) => {
            displayAlert(
              `Error establishing session - ${errorCode}`,
              errorMessage,
            );
          },
          () => {
            waitForTowerToCompleteSync(TOWER_SYNC_TIMEOUT);
          },
        );
      })
      .catch(error => {
        displayAlert('Error establishing session', error.message);
      });
  };

  // Waits for tower to sync with device/backend
  // simulates "waits a max of n seconds for sync to complete"
  const waitForTowerToCompleteSync = retryCount => {
    HarborLockersSDK.isSyncing(syncing => {
      if (retryCount === 0) {
        displayAlert('Timeout exceeded', 'Tower could not sync');
      } else if (syncing) {
        setTimeout(() => {
          waitForTowerToCompleteSync(retryCount - 1);
        }, 1000);
      } else {
        setAccessConfig({...accessConfig, my_tower_is_synced: true});
      }
    });
  };

  // request drop off tokens to open locker by id
  const openLockerForDropOff = async (towerId, lockerId, bearerToken) => {
    setAccessConfig({...accessConfig, can_reopen_locker: false});
    try {
      const lockerKeyPair = await API.createDropOffToken(
        towerId,
        lockerId,
        bearerToken,
      );
      // opens a target locker with encrypted key data
      const resultFromOpenCommand =
        await HarborLockersSDK.sendOpenLockerWithTokenCommand(
          lockerKeyPair.payload,
          lockerKeyPair.payload_auth,
        );
      if (resultFromOpenCommand) {
        confirmDoorIsOpen(resultFromOpenCommand[0], DOOR_TIMEOUT);
      } else {
        throw new Error('Could not open door');
      }
    } catch (error) {
      displayAlert('Door error', 'Could not open target door');
    }
  };

  // check if door did open
  // simulates "waits a max of n seconds for sync to complete"
  const confirmDoorIsOpen = (lockerId, retryCount) => {
    HarborLockersSDK.sendCheckLockerDoorCommand(doorOpen => {
      if (retryCount === 0) {
        displayAlert('Door error', 'Could not verify door state');
      } else if (doorOpen) {
        const updatedLockerArray = accessConfig.available_lockers.filter(
          item => item.id !== lockerId,
        );
        setAccessConfig({
          ...accessConfig,
          available_lockers: [...updatedLockerArray],
          can_reopen_locker: true,
        });
      } else {
        setTimeout(() => {
          confirmDoorIsOpen(lockerId, retryCount - 1);
        }, 1000);
      }
    });
  };

  // reopens the last locker door that was opened
  const reOpenLastDoorOpened = () => {
    HarborLockersSDK.sendReopenLockerCommand();
  };

  // check if bluetooth is enabled, if not then request permission
  const checkBluetoothPermissions = () => {
    requestMultiple(
      Platform.OS === 'android'
        ? [
            PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
            PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
            PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          ]
        : [PERMISSIONS.IOS.BLUETOOTH_PERIPHERAL],
    ).then(_ => {
      console.log('permission results', _);
    });
  };

  useEffect(() => {
    checkBluetoothPermissions();
  }, []);

  // listens to response from nearby towers after casting the startTowerDiscovery() func
  useEffect(() => {
    const subscription = eventEmitter.addListener('TowersFound', towers => {
      towers.forEach(tower => {
        if (tower.towerId.toLowerCase() === MY_TOWER_ID?.toLowerCase()) {
          setAccessConfig({
            ...accessConfig,
            my_tower_in_range: true,
          });
          return;
        }
      });
    });
    return () => {
      subscription.remove();
    };
  });

  return (
    <SafeAreaView style={styles.flexContainer}>
      <View style={styles.controls}>
        <Text style={styles.sectionTitle}>{'Controls'}</Text>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={styles.scrollviewOuter}
          contentContainerStyle={styles.scrollviewContent}>
          <Button
            title="Get SDK Credentials"
            onPress={() => loadConfig()}
            disabled={!!accessConfig.api_access_token}
          />
          <Button
            title="Initialize SDK"
            onPress={() => initSdk(accessConfig.sdk_token, SDK_ENV)}
            disabled={!accessConfig.sdk_token || accessConfig.sdk_initializated}
          />
          <Button
            title="My Tower Is In Range?"
            onPress={() => discoverMyTower()}
            disabled={!accessConfig.sdk_initializated}
          />
          <Button
            title="Connect to My Tower"
            onPress={() => connectToMyTower(MY_TOWER_ID)}
            disabled={!accessConfig.my_tower_in_range}
          />
          <Button
            title="Disconnect from Tower"
            onPress={() => endTowerSession()}
            disabled={!accessConfig.my_tower_is_synced}
          />
          <Button
            title="Reopen last locker"
            onPress={() => reOpenLastDoorOpened()}
            disabled={!accessConfig.can_reopen_locker}
          />
          <Button
            title="Get Available Lockers"
            onPress={() =>
              getAvailableLockersForDropOff(
                MY_TOWER_ID,
                accessConfig.api_access_token,
              )
            }
            disabled={!accessConfig.my_tower_is_synced}
          />
        </ScrollView>
      </View>
      <View style={styles.lockerLst}>
        <Text
          style={
            styles.sectionTitle
          }>{`Available Lockers: ${accessConfig.available_lockers.length}`}</Text>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={styles.scrollviewOuter}
          contentContainerStyle={styles.scrollviewContent}>
          {accessConfig.available_lockers.map(locker => (
            <Button
              title={`Open locker ${locker.name}`}
              onPress={() =>
                openLockerForDropOff(
                  MY_TOWER_ID,
                  locker.id,
                  accessConfig.api_access_token,
                )
              }
              disabled={!accessConfig.api_access_token}
              key={locker.id}
            />
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flexContainer: {flex: 1, backgroundColor: 'black'},
  controls: {flex: 5},
  lockerLst: {flex: 3},
  scrollviewContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  scrollviewOuter: {flex: 1},
  sectionTitle: {
    fontSize: 26,
    marginVertical: 16,
    alignSelf: 'center',
    color: '#F7EA48',
  },
});

export default App;
