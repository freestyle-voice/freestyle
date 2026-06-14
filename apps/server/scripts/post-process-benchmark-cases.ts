export interface BenchmarkCase {
  id: string;
  language: "en" | "es" | "zh-Hans";
  label: string;
  input: string;
  expected: string;
}

export const POST_PROCESS_BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: "date-correction-en",
    language: "en",
    label: "Date correction",
    input: "let's meet thursday wait no actually friday at three",
    expected: "Let's meet Friday at three.",
  },
  {
    id: "recipient-correction-en",
    language: "en",
    label: "Recipient correction",
    input: "send it to marketing actually no to legal",
    expected: "Send it to legal.",
  },
  {
    id: "list-after-correction-en",
    language: "en",
    label: "List after correction",
    input:
      "ship it from the warehouse actually no from the office and i need one cable two adapters three batteries",
    expected: "Ship it from the office:\n\n1. Cable\n2. Adapters\n3. Batteries",
  },
  {
    id: "ordered-steps-en",
    language: "en",
    label: "Ordered steps",
    input: "one update the docs two notify support three restart the server",
    expected: "1. Update the docs\n2. Notify support\n3. Restart the server",
  },
  {
    id: "light-punctuation-en",
    language: "en",
    label: "Light punctuation",
    input: "please send the draft by end of week",
    expected: "Please send the draft by end of week.",
  },
  {
    id: "preserve-reminder-en",
    language: "en",
    label: "Preserve reminder",
    input: "don't forget we still owe finance the revised contract review",
    expected: "Don't forget we still owe finance the revised contract review.",
  },
  {
    id: "dictated-list-en",
    language: "en",
    label: "Dictated list",
    input:
      "here's what i need by end of week sam please update the draft we also need design to sign off on the mockup and don't forget we still owe finance the revised contract review",
    expected:
      "Here's what I need by end of week:\n\n1. Sam, please update the draft.\n2. We also need design to sign off on the mockup.\n3. Don't forget we still owe finance the revised contract review.",
  },
  {
    id: "casual-preservation-en",
    language: "en",
    label: "Casual preservation",
    input:
      "hey just wanted to let you know we're gonna push the demo back a bit cuz we found some issues",
    expected:
      "Hey, just wanted to let you know we're gonna push the demo back a bit cuz we found some issues.",
  },
  {
    id: "superseded-plan-en",
    language: "en",
    label: "Superseded plan",
    input:
      "let's meet in san francisco uh wait oakland actually no let's just do a remote zoom call instead",
    expected: "Let's just do a remote Zoom call instead.",
  },
  {
    id: "date-correction-es",
    language: "es",
    label: "Correccion de fecha",
    input: "reunamonos el jueves espera no en realidad el viernes a las tres",
    expected: "Reunamonos el viernes a las tres.",
  },
  {
    id: "recipient-correction-es",
    language: "es",
    label: "Correccion de destinatario",
    input: "envialo a marketing en realidad no a legal",
    expected: "Envialo a legal.",
  },
  {
    id: "list-after-correction-es",
    language: "es",
    label: "Lista tras correccion",
    input:
      "envialo desde el almacen en realidad no desde la oficina y necesito un cable dos adaptadores tres baterias",
    expected:
      "Envialo desde la oficina:\n\n1. Un cable\n2. Dos adaptadores\n3. Tres baterias",
  },
  {
    id: "ordered-steps-es",
    language: "es",
    label: "Pasos ordenados",
    input:
      "uno actualiza la documentacion dos avisa a soporte tres reinicia el servidor",
    expected:
      "1. Actualiza la documentacion\n2. Avisa a soporte\n3. Reinicia el servidor",
  },
  {
    id: "light-punctuation-es",
    language: "es",
    label: "Puntuacion ligera",
    input: "por favor envia el borrador para fin de semana",
    expected: "Por favor envia el borrador para fin de semana.",
  },
  {
    id: "preserve-reminder-es",
    language: "es",
    label: "Recordatorio",
    input:
      "no olvides que todavia le debemos a finanzas la revision del contrato revisado",
    expected:
      "No olvides que todavia le debemos a finanzas la revision del contrato revisado.",
  },
  {
    id: "dictated-list-es",
    language: "es",
    label: "Lista dictada",
    input:
      "esto es lo que necesito para fin de semana sam por favor actualiza el borrador tambien necesitamos que diseno apruebe la maqueta y no olvides que todavia le debemos a finanzas la revision del contrato revisado",
    expected:
      "Esto es lo que necesito para fin de semana:\n\n1. Sam, por favor actualiza el borrador.\n2. Tambien necesitamos que diseno apruebe la maqueta.\n3. No olvides que todavia le debemos a finanzas la revision del contrato revisado.",
  },
  {
    id: "casual-preservation-es",
    language: "es",
    label: "Preservar tono casual",
    input:
      "hola solo queria avisarte que vamos a retrasar un poco la demo porque encontramos algunos problemas",
    expected:
      "Hola, solo queria avisarte que vamos a retrasar un poco la demo porque encontramos algunos problemas.",
  },
  {
    id: "superseded-plan-es",
    language: "es",
    label: "Plan reemplazado",
    input:
      "reunamonos en san francisco eh espera oakland en realidad no mejor hagamos una llamada de zoom remota",
    expected: "Mejor hagamos una llamada remota por Zoom.",
  },
  {
    id: "date-correction-zh",
    language: "zh-Hans",
    label: "日期更正",
    input: "我们周四见等等不对其实周五三点见",
    expected: "我们周五三点见。",
  },
  {
    id: "recipient-correction-zh",
    language: "zh-Hans",
    label: "收件人更正",
    input: "把它发给市场部其实不对发给法务",
    expected: "把它发给法务。",
  },
  {
    id: "list-after-correction-zh",
    language: "zh-Hans",
    label: "更正后的列表",
    input: "从仓库发货其实不对从办公室发我需要一个线缆两个适配器三个电池",
    expected: "从办公室发：\n\n1. 一个线缆\n2. 两个适配器\n3. 三个电池",
  },
  {
    id: "ordered-steps-zh",
    language: "zh-Hans",
    label: "有序步骤",
    input: "第一更新文档第二通知支持第三重启服务器",
    expected: "1. 更新文档\n2. 通知支持\n3. 重启服务器",
  },
  {
    id: "light-punctuation-zh",
    language: "zh-Hans",
    label: "轻量标点",
    input: "请在周末前把草稿发过来",
    expected: "请在周末前把草稿发过来。",
  },
  {
    id: "preserve-reminder-zh",
    language: "zh-Hans",
    label: "保留提醒",
    input: "别忘了我们还欠财务修订后合同的审阅",
    expected: "别忘了我们还欠财务修订后合同的审阅。",
  },
  {
    id: "dictated-list-zh",
    language: "zh-Hans",
    label: "口述列表",
    input:
      "这是我周末前需要的sam请更新草稿我们还需要设计确认模型别忘了我们还欠财务修订后合同的审阅",
    expected:
      "这是我周末前需要的：\n\n1. Sam，请更新草稿。\n2. 我们还需要设计确认模型。\n3. 别忘了我们还欠财务修订后合同的审阅。",
  },
  {
    id: "casual-preservation-zh",
    language: "zh-Hans",
    label: "保留随意语气",
    input: "嘿就是想告诉你我们得把演示稍微往后推一点因为发现了一些问题",
    expected:
      "嘿，就是想告诉你，我们得把演示稍微往后推一点，因为发现了一些问题。",
  },
  {
    id: "superseded-plan-zh",
    language: "zh-Hans",
    label: "被替换的计划",
    input: "我们在旧金山见吧呃等等奥克兰其实不对还是直接开个远程zoom会议吧",
    expected: "还是直接开个远程 Zoom 会议吧。",
  },
];
