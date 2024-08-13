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
import Config from './credentials';

// these are being imported from ./credentials
const CLIENT_NAME = Config.CLIENT_ID;
const CLIENT_SECRET = Config.CLIENT_SECRET;
const SDK_ENV = Config.SDK_ENV;
const MY_TOWER_ID = Config.MY_TOWER_ID;
const SESSION_ROLE = 5; // developer role
const TOWER_SYNC_TIMEOUT = 30; // number of seconds to wait before tower sync timeouts
const DOOR_TIMEOUT = 6; // number of seconds to wait before door status check timeouts

/* The URLs for all of these api calls are stored in ./api.js */

const initialState = {
  api_access_token: '',
  token_type: '',
  sdk_token: '',
  my_tower_is_connected: false,
  sdk_initializated: false,
  my_tower_is_synced: false,
  can_reopen_locker: false,
  available_lockers: [],
};

const App = () => {
  const eventEmitter = new NativeEventEmitter(NativeModules.HarborLockersSDK);
  const [accessConfig, setAccessConfig] = useState({...initialState});
  const [towerInRange, setTowerInRange] = useState(false);

  // error alert display
  const displayAlert = (alertTitle, alertBody) => {
    Alert.alert(alertTitle, alertBody, [
      {
        text: 'OK',
        onPress: () => {},
      },
    ]);
  };
  // check if bluetooth is enabled, if not then request permission
  const checkBluetoothPermissions = async () => {
    return Platform.OS === 'android'
      ? (async () => {
          const androidOsVer =
            Platform.OS === 'android' && Platform.constants['Release'];
          let androidPermissions = [PERMISSIONS.ANDROID.BLUETOOTH_SCAN];

          if (androidOsVer > 11) {
            androidPermissions.push(PERMISSIONS.ANDROID.BLUETOOTH_SCAN);
          }

          const statusesList = await requestMultiple(androidPermissions);
          return Object.values(statusesList);
        })()
      : requestMultiple([PERMISSIONS.IOS.BLUETOOTH_PERIPHERAL]);
  };

  // gets sdk & api tokens from api, authenticates user bearing the requested api token
  const loadConfig = async () => {
    try {
      const userData = await API.retrieveCredentials(
        CLIENT_NAME,
        CLIENT_SECRET,
      );
      setAccessConfig({...accessConfig, ...userData});
    } catch (error) {
      displayAlert(
        'Network error',
        'Is your information in credentials.js correct?',
      );
      console.log('Failed at loading config', error);
    }
  };

  // Once we have our SDK authentication token we can initialize the HarborLockersSDK.
  const initSdk = (sdkToken, env) => {
    HarborLockersSDK.setAccessToken(sdkToken, env);
    HarborLockersSDK.initializeSDK();
    //HarborLockersSDK.setLogLevel('debug'); // uncomment this line if you need to see debug information in the console. Such as firmware or SDK version
    setAccessConfig({...accessConfig, sdk_initializated: true});
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
        console.log('Cannot connect to tower', error);
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
      displayAlert(
        'Network error',
        'Failed to retrieve lockers, Try refreshing your SDK credentials',
      );
      console.log('Failed getting available lockers', error);
    }
  };
  const openLockerForDropOff = async (towerId, lockerId, bearerToken) => {
    setAccessConfig(prevAccessConfig => ({
      ...prevAccessConfig,
      can_reopen_locker: false,
    }));
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
      }
    } catch (error) {
      displayAlert('Door error', 'Could not open target door');
      console.log('Failed while opening the locker for drop off', error);
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

  // ends current session with tower
  const endTowerSession = () => {
    HarborLockersSDK.sendTerminateSession(0, 'Session terminated by user');
    setAccessConfig({...initialState});
  };

  useEffect(() => {
    checkBluetoothPermissions();
  }, []);

  // listens to response from nearby towers after casting the startTowerDiscovery() func
  useEffect(() => {
    const subscription = eventEmitter.addListener('TowersFound', towers => {
      towers.forEach(tower => {
        if (tower.towerId.toLowerCase() === MY_TOWER_ID?.toLowerCase()) {
          setTowerInRange(true);
          return;
        }
      });
    });
    const subscriptionLog = eventEmitter.addListener('HarborLogged', result => {
      console.log('HARBOR SDK LOG: ', result);
    });
    return () => {
      subscriptionLog.remove();
      subscription.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SafeAreaView style={styles.flexContainer}>
      <View style={styles.controls}>
        <Text style={styles.sectionTitle}>{'Controls'}</Text>
        <Text
          style={
            styles.sectionTitle
          }>{`Available Lockers: ${accessConfig.available_lockers.length}`}</Text>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          style={styles.scrollviewOuter}
          contentContainerStyle={styles.scrollviewContent}>
          <Button title="Get SDK Credentials" onPress={() => loadConfig()} />
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
            disabled={!towerInRange}
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
          <Button
            title="Reopen last locker"
            onPress={() => reOpenLastDoorOpened()}
            disabled={!accessConfig.can_reopen_locker}
          />
          <Button
            title="Disconnect from Tower"
            onPress={() => endTowerSession()}
            disabled={!accessConfig.my_tower_is_synced}
          />
        </ScrollView>
      </View>
      <View style={styles.lockerLst}>
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
    paddingVertical: 20,
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