// src/signalr.js
import * as signalR from '@microsoft/signalr';

const hubBase = import.meta.env.DEV ? 'http://127.0.0.1:5177' : ''; // PROD: ten sam origin
export const connection = new signalR.HubConnectionBuilder()
  .withUrl(`${hubBase}/nexus`)
  .withAutomaticReconnect()
  .build();
