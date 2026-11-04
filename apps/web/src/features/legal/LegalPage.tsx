import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { api } from '../../lib/api'
import { LanguageSwitch, Txt, useLanguage } from '../../lib/i18n'

type Section = { title: string; body: string[] }
type Copy = { title: string; intro: string; sections: Section[] }

const UPDATED = { en: 'Last updated 4 November 2026', fil: 'Huling binago noong 4 Nobyembre 2026' }

const TERMS: Record<'en' | 'fil', Copy> = {
  en: {
    title: 'Terms and Conditions',
    intro:
      'By creating an account or using BarangAI you agree to these terms. Please read them with the privacy notice.',
    sections: [
      {
        title: 'Not for emergencies',
        body: [
          'BarangAI is not an emergency service, and reports are not watched around the clock. If anyone is in danger, call 911 or your local emergency responders first.',
        ],
      },
      {
        title: 'What the service does',
        body: [
          'BarangAI lets residents send reports of community concerns to barangay staff, who decide what to do with them. Sending a report does not guarantee a response, a repair or any date for either.',
          'Reports are not forwarded automatically to other offices or agencies. Staff may contact them on their own.',
        ],
      },
      {
        title: 'AI suggestions can be wrong',
        body: [
          'AI may suggest a category, a description and hazard flags from your photo. These are guesses and their accuracy has not been measured. Check and correct them before sending. Staff verify reports and make the decisions.',
        ],
      },
      {
        title: 'Your responsibilities',
        body: [
          'Report only what you honestly believe is true, and keep your password to yourself.',
          'Do not send false or abusive reports, or try to disrupt the service or get around its limits.',
          'Send only photos you may share. Keep faces, plate numbers and other personal details out of them where you can. Automatic face blurring can miss faces.',
          'If you are a minor, use BarangAI with a parent or guardian.',
        ],
      },
      {
        title: 'Your reports',
        body: [
          'You keep ownership of what you send. You allow barangay staff and administrators to use it to handle the concern, and to show accepted issues on the shared map without your photos, descriptions or name.',
        ],
      },
      {
        title: 'Locations and borders',
        body: [
          'Map pins and barangay borders are approximate. The borders decide which staff see a report and are not legal boundaries.',
        ],
      },
      {
        title: 'Availability and limits',
        body: [
          'The service runs on a single computer in the local network. It may be unavailable or changed at any time, and daily limits apply. It is provided as it is, without any promise that it will always work or be free of errors. To the extent the law allows, the operator is not liable for loss caused by relying on it.',
          'Accounts that break these terms may be restricted or removed. Residents can delete their own account at any time from your account settings.',
        ],
      },
      {
        title: 'Changes and governing law',
        body: ['These terms may change, and the date above will show when. Philippine law applies.'],
      },
    ],
  },
  fil: {
    title: 'Mga Tuntunin at Kundisyon',
    intro:
      'Sa paggawa ng account o paggamit ng BarangAI, sumasang-ayon ka sa mga tuntuning ito. Basahin din ang abiso sa privacy.',
    sections: [
      {
        title: 'Hindi para sa emergency',
        body: [
          'Hindi serbisyong pang-emergency ang BarangAI, at hindi binabantayan ang mga ulat sa buong araw at gabi. Kung may nasa panganib, tumawag muna sa 911 o sa lokal na tumutugon sa emergency.',
        ],
      },
      {
        title: 'Ang ginagawa ng serbisyo',
        body: [
          'Sa BarangAI, naipapadala ng mga residente sa kawani ng barangay ang mga ulat tungkol sa problema sa komunidad, at ang kawani ang magpapasya kung ano ang gagawin. Hindi tinitiyak ng pagpapadala ng ulat na may tutugon, may aayos, o kung kailan ito mangyayari.',
          'Hindi kusang ipinapasa ang mga ulat sa ibang opisina o ahensiya. Maaaring makipag-ugnayan sa kanila ang kawani kung kinakailangan.',
        ],
      },
      {
        title: 'Maaaring magkamali ang AI',
        body: [
          'Maaaring magmungkahi ang AI ng kategorya, paglalarawan at babala tungkol sa panganib mula sa iyong larawan. Hula lamang ang mga ito at hindi pa nasusukat ang katumpakan. Suriin at itama bago ipadala. Ang kawani ang nagbeberipika ng mga ulat at nagpapasya.',
        ],
      },
      {
        title: 'Ang iyong mga pananagutan',
        body: [
          'Iulat lamang ang tapat mong pinaniniwalaang totoo, at huwag ibahagi ang iyong password.',
          'Huwag magpadala ng pekeng o mapang-abusong ulat, at huwag guluhin ang serbisyo o iwasan ang mga limitasyon nito.',
          "Magpadala lamang ng mga larawang maaari mong ibahagi. Hangga't maaari, iwasang makuhanan ang mukha, plaka at iba pang personal na detalye. Maaaring hindi matakpan ng awtomatikong pag-blur ang lahat ng mukha.",
          'Kung menor de edad ka, gamitin ang BarangAI kasama ang magulang o tagapag-alaga.',
        ],
      },
      {
        title: 'Ang iyong mga ulat',
        body: [
          'Sa iyo pa rin ang ipinadala mo. Pinapayagan mo ang kawani ng barangay at mga administrator na gamitin ito para asikasuhin ang problema, at ipakita ang mga tinanggap na isyu sa pinagsasaluhang mapa nang wala ang iyong larawan, paglalarawan o pangalan.',
        ],
      },
      {
        title: 'Mga lokasyon at hangganan',
        body: [
          'Tinatayang posisyon lamang ang mga pin sa mapa at hangganan ng barangay. Tinutukoy ng mga hangganan kung aling kawani ang makakakita ng ulat, at hindi ito mga legal na hangganan.',
        ],
      },
      {
        title: 'Pagiging available at mga limitasyon',
        body: [
          "Tumatakbo ang serbisyo sa iisang computer sa local network. Maaari itong hindi magamit o mabago anumang oras, at may mga limitasyon bawat araw. Ibinibigay ito kung ano ito, nang walang pangakong laging gagana o walang mali. Hangga't pinapayagan ng batas, walang pananagutan ang operator sa pinsalang dulot ng pag-asa rito.",
          'Maaaring limitahan o alisin ang mga account na lumalabag sa mga tuntuning ito. Maaaring burahin ng mga residente ang sarili nilang account anumang oras sa mga setting ng account.',
        ],
      },
      {
        title: 'Mga pagbabago at batas na umiiral',
        body: [
          'Maaaring magbago ang mga tuntuning ito, at ipapakita ng petsa sa itaas kung kailan. Batas ng Pilipinas ang umiiral.',
        ],
      },
    ],
  },
}

const PRIVACY: Record<'en' | 'fil', Copy> = {
  en: {
    title: 'Privacy Notice',
    intro: 'This notice explains what BarangAI collects, why, and who can see it.',
    sections: [
      {
        title: 'What we collect',
        body: [
          'Your email address and a protected form of your password. If you sign in with Google, the account identifier Google gives us.',
          'Each report: your photo, the map pin, the category, your description, and anything you add later.',
          "Checks read from the original photo (the date, whether it has camera details, and how far its GPS is from your pin). We store the result of the checks, not the photo's details.",
          'What the AI worked out from your photo: its suggested category, hazard flags and a numeric summary used to find similar photos. Also the street name for your pin.',
          'Your language and appearance settings, and the time you agreed to these terms.',
        ],
      },
      {
        title: 'How photos are protected',
        body: [
          'Photos are resized, faces and license plates are blurred where our software finds them, and metadata such as GPS is removed before storage. Blurring can miss faces and license plates. Photos are kept in private storage, and each view is checked against your account or staff role.',
        ],
      },
      {
        title: 'Why we use it',
        body: [
          'To receive and handle your reports, tell you about their progress, find duplicate reports, keep accounts secure and limit abuse.',
        ],
      },
      {
        title: 'Who can see it',
        body: [
          'Staff of the barangay where your pin falls, and administrators, see your report, including your account ID. Pins outside every boundary go to administrators only. Until barangay borders are set up, all staff can see every report.',
          'Once staff accept an issue, other signed-in residents see it on the shared map: category, status, location to about 11 metres, street name, dates and the number of residents who reported it. They do not see your photo, description or name.',
        ],
      },
      {
        title: 'Services that handle data for us',
        body: [
          'The app, its database and photos run on a computer kept by the team operating this service, not on an outside host. Phones connect to it over local Wi-Fi without encryption, so use it only on a network you trust.',
          'When AI suggestions are on, Cloudflare receives the cleaned photo to write a suggestion, and street names and counts of open reports to word the staff summary. It also receives what you type to the chatbot, and we try to remove email addresses and phone numbers first, so leave out personal details.',
          "OpenStreetMap's Nominatim receives your pin, rounded to about 11 metres, to find the street name. Your browser loads map images directly from OpenStreetMap, which sees your internet address and the map area.",
          "If you connect Rokid Glasses, photos taken with them pass from the glasses to your phone through the Rokid AI App before reaching BarangAI, and the glasses show what Kap found. Rokid's own terms cover that app.",
          'Google is involved only if you choose Google sign-in. Some of these services may process data outside the Philippines. We do not sell your data, and reports are not forwarded automatically to other offices.',
        ],
      },
      {
        title: 'How long we keep it',
        body: [
          'There is no automatic deletion schedule yet: reports are kept until you delete your account, or barangay staff or an administrator delete them. Backup copies are not changed by a deletion, so they keep the data until they are removed, and restoring one can bring it back until it is deleted again. After a report is deleted, we keep only a record that a deletion request was decided, with no content from the report.',
        ],
      },
      {
        title: 'Your rights',
        body: [
          "Under the Data Privacy Act of 2012 you may ask to see or correct your data, object to its use, and have it deleted. To see or correct your data, use the contact below. You can ask for a report to be deleted from that report's page, or delete your account and all its reports in your account settings. You may also complain to the National Privacy Commission.",
        ],
      },
    ],
  },
  fil: {
    title: 'Abiso sa Privacy',
    intro: 'Ipinapaliwanag ng abisong ito kung ano ang kinokolekta ng BarangAI, bakit, at sino ang makakakita nito.',
    sections: [
      {
        title: 'Ang kinokolekta namin',
        body: [
          'Ang iyong email address at protektadong anyo ng iyong password. Kung Google ang gamit mo sa pag-sign in, ang identifier ng account na ibinibigay ng Google.',
          'Sa bawat ulat: ang iyong larawan, pin sa mapa, kategorya, paglalarawan, at anumang idaragdag mo pagkatapos.',
          'Mga pagsusuring binasa mula sa orihinal na larawan (petsa, kung may detalye ng camera, at layo ng GPS nito sa iyong pin). Ang resulta ng pagsusuri ang itinatago namin, hindi ang mga detalye ng larawan.',
          'Ang nakuha ng AI mula sa iyong larawan: iminungkahing kategorya, mga babala sa panganib at buod na numero na ginagamit para makahanap ng magkakahawig na larawan. Pati ang pangalan ng kalye ng iyong pin.',
          'Ang iyong setting sa wika at hitsura, at ang oras ng pagsang-ayon mo sa mga tuntuning ito.',
        ],
      },
      {
        title: 'Paano pinoprotektahan ang mga larawan',
        body: [
          'Bago itago, binabago ang laki ng mga larawan, bina-blur ang mga mukha at plakang nakikita ng aming software, at inaalis ang metadata gaya ng GPS. Maaaring may mga mukha at plakang hindi ma-blur. Nasa pribadong storage ang mga larawan, at sinusuri ang bawat pagtingin batay sa iyong account o tungkulin bilang kawani.',
        ],
      },
      {
        title: 'Bakit namin ito ginagamit',
        body: [
          'Para matanggap at maasikaso ang iyong mga ulat, maipaalam ang progreso, makita ang magkakaparehong ulat, mapanatiling ligtas ang mga account at malimitahan ang pang-aabuso.',
        ],
      },
      {
        title: 'Sino ang makakakita',
        body: [
          'Makikita ng kawani ng barangay kung saan nakalagay ang iyong pin, at ng mga administrator, ang iyong ulat, kasama ang ID ng iyong account. Sa mga administrator lamang napupunta ang mga pin na nasa labas ng lahat ng hangganan. Habang hindi pa naitatakda ang mga hangganan ng barangay, makikita ng lahat ng kawani ang bawat ulat.',
          'Kapag tinanggap ng kawani ang isyu, makikita ito ng ibang residenteng naka-sign in sa pinagsasaluhang mapa: kategorya, katayuan, lokasyon na hanggang mga 11 metro ang tumpak, pangalan ng kalye, mga petsa at bilang ng residenteng nag-ulat. Hindi nila makikita ang iyong larawan, paglalarawan o pangalan.',
        ],
      },
      {
        title: 'Mga serbisyong humahawak ng datos para sa amin',
        body: [
          'Tumatakbo ang app, ang database at mga larawan sa isang computer na hawak ng team na nagpapatakbo ng serbisyong ito, hindi sa panlabas na host. Kumokonekta rito ang mga telepono sa lokal na Wi-Fi nang walang encryption, kaya gamitin lamang ito sa network na pinagkakatiwalaan mo.',
          'Kapag naka-on ang mungkahi ng AI, natatanggap ng Cloudflare ang nalinis na larawan para makagawa ng mungkahi, at mga pangalan ng kalye at bilang ng bukas na ulat para sa buod ng kawani. Natatanggap din nito ang itina-type mo sa chatbot, at sinusubukan naming alisin muna ang email at numero ng telepono, kaya huwag isama ang personal na detalye.',
          'Natatanggap ng Nominatim ng OpenStreetMap ang iyong pin, na ni-round sa mga 11 metro, para mahanap ang pangalan ng kalye. Direktang kinukuha ng iyong browser ang larawan ng mapa mula sa OpenStreetMap, na nakakakita ng iyong internet address at bahagi ng mapa.',
          'Kung i-connect mo ang Rokid Glasses, dumadaan ang photo mula sa glasses papunta sa phone mo sa Rokid AI App bago makarating sa BarangAI, at ipinapakita ng glasses ang nakita ni Kap. Sakop ng sariling terms ng Rokid ang app na iyon.',
          'Kasali lamang ang Google kung pipiliin mo ang pag-sign in gamit ang Google. Maaaring iproseso ng ilan sa mga serbisyong ito ang datos sa labas ng Pilipinas. Hindi namin ibinebenta ang iyong datos, at hindi kusang ipinapasa ang mga ulat sa ibang opisina.',
        ],
      },
      {
        title: 'Gaano katagal namin ito itinatago',
        body: [
          'Wala pang awtomatikong iskedyul ng pagbura: itinatago ang mga ulat hanggang burahin mo ang account mo, o burahin ito ng staff ng barangay o ng administrator. Hindi nababago ng pagbura ang mga backup copy, kaya nandoon pa ang data hanggang alisin ang mga ito, at puwede itong bumalik kapag ni-restore hanggang burahin ulit. Pagkatapos burahin ang ulat, ang natitira lamang ay tala na napagpasyahan ang hiling na magbura, nang walang nilalaman ng ulat.',
        ],
      },
      {
        title: 'Ang iyong mga karapatan',
        body: [
          'Sa ilalim ng Data Privacy Act of 2012, maaari mong hilingin na makita o itama ang iyong datos, tumutol sa paggamit nito, at ipabura ito. Para makita o maitama ang iyong datos, gamitin ang contact sa ibaba. Maaari kang humiling na burahin ang ulat sa pahina ng ulat na iyon, o burahin ang iyong account at lahat ng ulat nito sa mga setting ng account. Maaari ka ring magreklamo sa National Privacy Commission.',
        ],
      },
    ],
  },
}

function Operator() {
  const operator = useQuery({
    queryKey: ['legal-operator'],
    queryFn: () => api<{ name: string | null; contact: string | null }>('/legal/operator'),
    staleTime: Infinity,
  })
  if (!operator.isSuccess) return null
  return (
    <section>
      <h2 className="mt-7 mb-2 text-[18px] font-semibold">
        <Txt>Who runs this service</Txt>
      </h2>
      {operator.data.name || operator.data.contact ? (
        <p className="text-[15.5px] leading-relaxed">
          {[operator.data.name, operator.data.contact].filter(Boolean).join(' · ')}
        </p>
      ) : (
        <p className="text-[15.5px] leading-relaxed">
          <Txt>The operator's name and contact details have not been published yet.</Txt>
        </p>
      )}
    </section>
  )
}

/** The terms and privacy notice, public so they can be read before signing up. */
export function LegalPage({ page }: { page: 'terms' | 'privacy' }) {
  const { language } = useLanguage()
  const copy = (page === 'terms' ? TERMS : PRIVACY)[language]
  return (
    <main className="pt-safe mx-auto min-h-dvh max-w-2xl bg-background px-5 pb-16">
      <div className="flex h-14 items-center justify-between">
        <Link to="/" className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-[15px] font-medium text-link">
          <ArrowLeft className="size-4" aria-hidden="true" />
          <Txt>Back to BarangAI</Txt>
        </Link>
        <LanguageSwitch />
      </div>
      <h1 className="mt-3 text-[30px] leading-tight font-bold">{copy.title}</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">{UPDATED[language]}</p>
      <p className="mt-4 text-[16px] leading-relaxed">{copy.intro}</p>
      {copy.sections.map(section => (
        <section key={section.title}>
          <h2 className="mt-7 mb-2 text-[18px] font-semibold">{section.title}</h2>
          <div className="space-y-2.5">
            {section.body.map(text => (
              <p key={text} className="text-[15.5px] leading-relaxed">
                {text}
              </p>
            ))}
          </div>
        </section>
      ))}
      <Operator />
      <nav className="mt-8 flex gap-4 text-[15px] font-medium text-link">
        <Link to={page === 'terms' ? '/privacy' : '/terms'} className="min-h-11">
          <Txt>{page === 'terms' ? 'Privacy notice' : 'Terms and conditions'}</Txt>
        </Link>
      </nav>
    </main>
  )
}

/** Small links for sign-in, settings and the home page. */
export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`text-[13px] text-muted-foreground ${className}`}>
      <Link to="/terms" className="underline underline-offset-2">
        <Txt>Terms and conditions</Txt>
      </Link>
      {' · '}
      <Link to="/privacy" className="underline underline-offset-2">
        <Txt>Privacy notice</Txt>
      </Link>
    </p>
  )
}
