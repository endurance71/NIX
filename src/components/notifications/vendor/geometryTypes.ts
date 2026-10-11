// Adapted from rit3zh/expo-dynamic-notifications, commit 5de059a. See LICENSE.
import type { INotificationLayout } from "./layoutTypes";

interface IBuildNotificationGeometry {
  drop: number;
  expand: number;
  layout: INotificationLayout;
}

interface INotificationGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  neckX: number;
  neckY: number;
  neckWidth: number;
  neckHeight: number;
  neckRadius: number;
  shadowOpacity: number;
  offsetY: number;
  widthRatio: number;
}


export type { IBuildNotificationGeometry, INotificationGeometry };
