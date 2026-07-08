"use client";

import { useState } from "react";


export default function GeneratePage(){

  const [topic,setTopic] = useState("");
  const [article,setArticle] = useState<any>(null);


  async function createArticle(){

    const res = await fetch(
      "/api/generate",
      {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          topic
        })
      }
    );


    const data = await res.json();

    setArticle(data);

  }



  return (

    <main className="p-8">


      <h1 className="text-4xl font-bold">
        🤖 AI記事生成
      </h1>


      <input

        className="
        border
        p-3
        rounded
        mt-6
        w-full
        "

        placeholder="記事テーマを入力"

        value={topic}

        onChange={(e)=>
          setTopic(e.target.value)
        }

      />


      <button

        onClick={createArticle}

        className="
        mt-4
        bg-black
        text-white
        px-6
        py-3
        rounded
        "

      >

        生成

      </button>



      {article && (

        <div className="mt-10">


          <h2 className="text-2xl font-bold">
            {article.title}
          </h2>


          <p className="mt-4">
            {article.summary}
          </p>


          <h3 className="mt-6 font-bold">
            AI分析
          </h3>


          <p>
            {article.analysis}
          </p>


        </div>

      )}


    </main>

  );

}