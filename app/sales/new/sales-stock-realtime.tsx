"use client";

import {useEffect} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";

export default function SalesStockRealtime(){
 const router=useRouter();
 useEffect(()=>{
  const supabase=createClient();
  let timer:ReturnType<typeof setTimeout>|null=null;
  let mounted=true;
  const refresh=()=>{
   if(!mounted)return;
   if(timer)clearTimeout(timer);
   timer=setTimeout(()=>{if(mounted)router.refresh();},250);
  };
  const channel=supabase.channel("sales-stock-availability")
   .on("postgres_changes",{event:"*",schema:"public",table:"inventory_balances"},refresh)
   .subscribe(status=>{if(status==="SUBSCRIBED")refresh();});
  return()=>{
   mounted=false;
   if(timer)clearTimeout(timer);
   void supabase.removeChannel(channel);
  };
 },[router]);
 return null;
}
