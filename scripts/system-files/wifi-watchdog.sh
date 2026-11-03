#!/bin/bash
# WiFi watchdog for Home Screens display
GATEWAY=$(ip route show default 2>/dev/null | awk "/default via/ {print \$3; exit}")
[ -z "$GATEWAY" ] && exit 0
LOG_TAG=wifi-watchdog
if ping -c 3 -W 5 $GATEWAY > /dev/null 2>&1; then exit 0; fi
logger -t $LOG_TAG "Gateway unreachable, attempting NM reconnect"
WIFI_CONN=$(nmcli -t -f NAME,TYPE connection show 2>/dev/null | grep ":802-11-wireless$" | head -1 | cut -d: -f1)
[ -z "$WIFI_CONN" ] && exit 1
nmcli connection up "$WIFI_CONN" 2>/dev/null; sleep 10
if ping -c 3 -W 5 $GATEWAY > /dev/null 2>&1; then logger -t $LOG_TAG "Reconnected via NM"; exit 0; fi
logger -t $LOG_TAG "NM reconnect failed, cycling wlan0"
nmcli device disconnect wlan0 2>/dev/null; sleep 3; nmcli device connect wlan0 2>/dev/null; sleep 10
if ping -c 3 -W 5 $GATEWAY > /dev/null 2>&1; then logger -t $LOG_TAG "Reconnected via interface cycle"; exit 0; fi
logger -t $LOG_TAG "Interface cycle failed, reloading brcmfmac"
modprobe -r brcmfmac && sleep 2 && modprobe brcmfmac; sleep 15
nmcli connection up "$WIFI_CONN" 2>/dev/null
logger -t $LOG_TAG "Driver reloaded, connection attempt sent"
