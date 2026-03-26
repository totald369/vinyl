"use client";

import Lottie from "lottie-react";
import animationData from "@/Img/Check.json";

type Props = {
  className?: string;
};

export default function CheckLottie({ className }: Props) {
  return (
    <Lottie
      className={className}
      animationData={animationData}
      loop={false}
      autoplay
    />
  );
}

